"""Local queue and source-backed concert facts for public band workspaces."""

from datetime import date, datetime, timezone
from collections import defaultdict
import json
import re
import unicodedata


FIELDS = ("date", "previous_date", "status", "city", "venue", "title",
          "arrival", "soundcheck", "show", "contact")
STATUS_LABELS = {
    "confirmed": "potvrzeno", "option": "předběžně",
    "inquiry": "poptávka", "cancelled": "zrušeno",
}
SCHEMA = """
CREATE TABLE IF NOT EXISTS public_concert_settings (
    band_id TEXT PRIMARY KEY REFERENCES public_bands(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS public_concert_threads (
    connection_id TEXT NOT NULL REFERENCES public_gmail_connections(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    processed_revision INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after INTEGER NOT NULL DEFAULT 0,
    facts_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (connection_id, thread_id)
);
CREATE TABLE IF NOT EXISTS public_concert_usage (
    band_id TEXT NOT NULL REFERENCES public_bands(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    calls INTEGER NOT NULL,
    PRIMARY KEY (band_id, day)
);
CREATE INDEX IF NOT EXISTS public_concert_pending ON public_concert_threads(retry_after)
    WHERE revision != processed_revision AND attempts < 3;
"""


def initialize(database):
    existing = database.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='public_concert_threads'"
    ).fetchone()
    database.executescript(SCHEMA)
    for kind, event, row in (
        ("insert", "INSERT", "NEW"),
        ("update", "UPDATE OF subject, body_text, sender_email, internal_date, snippet, labels_json", "NEW"),
        ("delete", "DELETE", "OLD"),
    ):
        changed = ""
        if kind == "update":
            fields = ("subject", "body_text", "sender_email", "internal_date", "snippet")
            visibility = " OR ".join(
                f"""(OLD.labels_json LIKE '%"{label}"%') != (NEW.labels_json LIKE '%"{label}"%')"""
                for label in ("TRASH", "SPAM", "DRAFT")
            )
            changed = "WHEN " + " OR ".join([*(f"OLD.{f} IS NOT NEW.{f}" for f in fields), visibility])
        database.execute(f"""
            CREATE TRIGGER IF NOT EXISTS public_concert_{kind}
            AFTER {event} ON public_gmail_messages {changed}
            BEGIN
                INSERT INTO public_concert_threads(connection_id, thread_id)
                SELECT {row}.connection_id, {row}.thread_id
                WHERE EXISTS (SELECT 1 FROM public_gmail_connections WHERE id={row}.connection_id)
                ON CONFLICT(connection_id, thread_id) DO UPDATE SET
                    revision=revision+1, attempts=0, retry_after=0;
            END
        """)
    if not existing:
        database.execute("""
            INSERT OR IGNORE INTO public_concert_threads(connection_id, thread_id)
            SELECT connection_id, thread_id FROM public_gmail_messages
            GROUP BY connection_id, thread_id
        """)


def normalized(value):
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def concert_candidate(messages):
    pattern = (r"\b(?:koncert|festival|vystoupen|zvukov|honorar|prijezd|naloz|poradatel|svatb|turne|ples|slavnost)\w*"
               r"|\b(?:soundcheck|gig|booking|venue|arrival|load in|kulturni dum|termin hrani)\b"
               r"|\b(?:zahrajete|muzete zahrat|potvrzujeme termin|potvrzuji termin)\b")
    for message in messages:
        if message["sender_email"] == "robot@culter.cz":
            return True
        body = message["body_text"] or message["snippet"] or ""
        subject = message["subject"] or ""
        text = normalized(subject + " " + body)
        if re.search(pattern, text):
            return True
        if re.search(r"\b(?:hraj\w*|kapel\w*|termin\w*)\b", text):
            if re.search(r"\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\.\s*\d{1,2}\.?|\d{1,2}:\d{2})\b", subject + " " + body):
                return True
    return False


def extraction_schema():
    field = {
        "type": "object",
        "properties": {
            "field": {"type": "string", "enum": list(FIELDS)},
            "value": {"type": "string"},
            "message_id": {"type": "string"},
            "quote": {"type": "string"},
            "explicit_change": {"type": "boolean"},
        },
        "required": ["field", "value", "message_id", "quote", "explicit_change"],
        "additionalProperties": False,
    }
    event = {
        "type": "object", "properties": {"facts": {"type": "array", "items": field}},
        "required": ["facts"], "additionalProperties": False,
    }
    return {
        "type": "object", "properties": {"events": {"type": "array", "items": event}},
        "required": ["events"], "additionalProperties": False,
    }


def validate_events(events, excerpts, messages):
    """Keep only facts with a literal, traceable excerpt from the submitted mail."""
    sources = {row["message_id"]: row for row in messages}
    validated = []
    for event in events:
        facts = []
        for raw in event["facts"]:
            field, value = raw["field"], raw["value"].strip()
            msg_id = raw["message_id"]
            quote = " ".join(raw["quote"].split())
            if (field not in FIELDS or msg_id not in excerpts or not value
                    or not 3 <= len(quote) <= 500 or quote not in " ".join(excerpts[msg_id].split())):
                continue
            if field in ("date", "previous_date"):
                try:
                    parsed = date.fromisoformat(value)
                except ValueError:
                    continue
                if not 2000 <= parsed.year <= 2100:
                    continue
                month, day, year = parsed.month, parsed.day, parsed.year
                date_patterns = (
                    rf"\b{year}-0?{month}-0?{day}\b",
                    rf"\b0?{day}\.\s*0?{month}\.\s*{year}\b",
                    rf"\b0?{day}\.\s*(?:{CZECH_MONTHS[month - 1]})\s*{year}\b",
                )
                if not any(re.search(pattern, quote, re.IGNORECASE) for pattern in date_patterns):
                    continue
            elif field == "status":
                if value not in STATUS_LABELS:
                    continue
            elif field in ("arrival", "soundcheck", "show"):
                if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
                    continue
                hour, minute = map(int, value.split(":"))
                patterns = [rf"\b0?{hour}[:.]{minute:02d}\b"]
                if minute == 0:
                    patterns.append(rf"\b0?{hour}\s*(?:h|hod(?:in)?)\b")
                if not any(re.search(pattern, quote, re.I) for pattern in patterns):
                    continue
            elif normalized(value) not in normalized(quote):
                if field != "city" or (normalized(value), normalized(quote)) not in (("praha", "prague"),):
                    continue
            source = sources[msg_id]
            facts.append({
                "field": field, "value": value[:250], "message_id": msg_id,
                "quote": quote, "explicit_change": bool(raw["explicit_change"]),
                "snapshot": bool(event.get("snapshot")),
                "timestamp": source["internal_date"], "url": source["web_url"],
                "subject": source["subject"],
            })
        if any(fact["field"] == "date" for fact in facts):
            validated.append(facts)
    return validated


CZECH_MONTHS = (
    "leden|ledna", "únor|února", "březen|března", "duben|dubna",
    "květen|května", "červen|června", "červenec|července", "srpen|srpna",
    "září", "říjen|října", "listopad|listopadu", "prosinec|prosince",
)


def culter_events(messages):
    """Use local parsing when a Culter notification contains unambiguous fields."""
    events = []
    if not messages or any(row["sender_email"] != "robot@culter.cz" for row in messages):
        return None
    for row in messages:
        subject = row["subject"] or ""
        body = row["body_text"] or ""
        date_match = re.search(r"^Culter\.cz (?:modified|new|updated) term (20\d\d-\d\d-\d\d)\b", subject, re.I)
        statuses = list(re.finditer(
            r"^[ \t]*(?:(?:stav|status)[ \t]*[:=][ \t]*)?(YES|OPTION|CANCELLED)[ \t]*\r?$",
            body, re.I | re.M,
        ))
        labels = {}
        for field, names in (
            ("city", "město|city"), ("venue", "místo|klub|venue"),
            ("arrival", "příjezd|arrival"), ("soundcheck", "zvukovka|soundcheck"),
            ("show", "hraní|show(?: time)?"), ("contact", "kontakt|contact"),
        ):
            match = re.search(rf"^[ \t]*(?:{names})[ \t]*:[ \t]*(\S[^\r\n]*)$", body, re.I | re.M)
            if match:
                labels[field] = (match[1].strip(), match[0].strip())
        if not date_match or len(statuses) != 1 or "venue" not in labels:
            return None
        status_match = statuses[0]
        quote = status_match[0].strip()
        status = {"YES": "confirmed", "OPTION": "option", "CANCELLED": "cancelled"}[status_match[1].upper()]
        facts = {"date": (date_match[1], subject), "status": (status, quote), **labels}
        events.append({"snapshot": True, "facts": [
            {"field": field, "value": value, "message_id": row["message_id"],
             "quote": excerpt, "explicit_change": False}
            for field, (value, excerpt) in facts.items()
        ]})
    return events


def field_history(facts, field):
    return sorted((fact for fact in facts if fact["field"] == field), key=lambda fact: (
        fact["timestamp"], fact["explicit_change"], fact["message_id"], fact["value"]
    ))


def resolve_field(facts, field):
    history = field_history(facts, field)
    if not history:
        return []
    if field == "status":
        # An older/later inquiry alone cannot undo a clearly booked or cancelled concert.
        firm = [item for item in history if item["value"] in ("confirmed", "cancelled")]
        if firm:
            history = firm
        transitions = [item for item in history if item["explicit_change"] or item.get("snapshot")
                       or item["value"] == "cancelled"]
        if transitions:
            marker = transitions[-1]["timestamp"]
            history = [item for item in history if item["timestamp"] >= marker]
        return list({item["value"]: item for item in history}.values())
    if field == "date":
        return history[-1:]
    revisions = [item for item in history if item["explicit_change"] or item.get("snapshot")]
    if revisions:
        history = [item for item in history if item["timestamp"] >= revisions[-1]["timestamp"]]
    if field == "city":
        return list({city_key(item["value"]): item for item in history}.values())
    return list({normalized(item["value"]): item for item in history}.values())


def city_key(value):
    key = normalized(value)
    return {"prague": "praha", "pilsen": "plzen", "olomouce": "olomouc",
            "praze": "praha", "brne": "brno", "brna": "brno"}.get(key, key)


def reconcile(events):
    """Merge evidenced identities and explicit moves before applying query filters."""
    groups = {}
    identifiers = defaultdict(set)
    ordered = sorted(events, key=lambda item: (
        resolve_field(item[1], "date")[0]["timestamp"], item[0]
    ))
    for thread_key, facts in ordered:
        day = resolve_field(facts, "date")[0]["value"]
        venues = {normalized(item["value"]) for item in resolve_field(facts, "venue")}
        cities = {city_key(item["value"]) for item in resolve_field(facts, "city")}
        titles = {normalized(item["value"]) for item in resolve_field(facts, "title")}
        places = {("venue", venue) for venue in venues}
        places.update(("city-title", city, title) for city in cities for title in titles)
        identities = {(day, *place) for place in places}
        same_thread = (day, "thread", thread_key)
        strong_ids = set().union(*(identifiers[key] for key in identities))
        weak_matches = identifiers[same_thread] if not places else {
            group_id for group_id in identifiers[same_thread]
            if not resolve_field(groups[group_id], "venue")
        }
        matches = strong_ids or weak_matches
        for fact in field_history(facts, "previous_date"):
            if fact["explicit_change"]:
                previous = fact["value"]
                earlier = set().union(*(identifiers[(previous, *place)] for place in places))
                matches = matches | (earlier or identifiers[(previous, "thread", thread_key)])
        group_id = next(iter(matches)) if len(matches) == 1 else len(groups)
        groups.setdefault(group_id, []).extend(facts)
        for identity in (*identities, same_thread):
            identifiers[identity].add(group_id)
    return [
        {**{field: resolve_field(facts, field) for field in FIELDS}, "changes": event_changes(facts)}
        for facts in groups.values()
    ]


def event_changes(facts):
    changes = []
    for field in ("date", "arrival", "soundcheck", "show", "venue", "status"):
        previous = None
        for current in field_history(facts, field):
            different = previous is not None and normalized(previous["value"]) != normalized(current["value"])
            if ((current["explicit_change"] and (different or previous is None))
                    or (current.get("snapshot") and different)
                    or (field == "status" and current["value"] == "cancelled" and (different or previous is None))):
                changes.append(current)
            previous = current
    return changes


def reserve(database, band, limit, now):
    day = datetime.fromtimestamp(now, timezone.utc).date().isoformat()
    database.execute("BEGIN IMMEDIATE")
    used = database.execute(
        "SELECT COALESCE(SUM(calls),0), COALESCE(SUM(CASE WHEN band_id=? THEN calls END),0) "
        "FROM public_concert_usage WHERE day=?", (band, day),
    ).fetchone()
    if used[0] >= 200 or used[1] >= limit:
        return False
    database.execute("""
        INSERT INTO public_concert_usage VALUES (?, ?, 1)
        ON CONFLICT(band_id, day) DO UPDATE SET calls=calls+1
    """, (band, day))
    return True


def status(database, band):
    config = database.execute(
        "SELECT enabled FROM public_concert_settings WHERE band_id=?", (band,)
    ).fetchone()
    inboxes = database.execute(
        "SELECT sync_state, last_sync_at FROM public_gmail_connections WHERE band_id=?", (band,)
    ).fetchall()
    counts = database.execute("""
        SELECT COUNT(*) AS total, COUNT(CASE WHEN t.revision!=t.processed_revision THEN 1 END) AS pending,
               COUNT(CASE WHEN t.revision!=t.processed_revision AND t.attempts>=3 THEN 1 END) AS failed
        FROM public_concert_threads t JOIN public_gmail_connections g ON g.id=t.connection_id
        WHERE g.band_id=?
    """, (band,)).fetchone()
    snapshots = [row["last_sync_at"] for row in inboxes if row["last_sync_at"]]
    return {
        "enabled": bool(config and config["enabled"]),
        "pending": counts["pending"], "failed": counts["failed"],
        "incompleteInboxes": sum(row["sync_state"] != "ready" for row in inboxes),
        "asOf": min(snapshots) if snapshots else None,
    }


def read_events(database, band):
    threads = database.execute("""
        SELECT t.connection_id, t.thread_id, t.facts_json
        FROM public_concert_threads t JOIN public_gmail_connections g ON g.id=t.connection_id
        WHERE g.band_id=? AND t.revision=t.processed_revision AND t.facts_json!='[]'
    """, (band,)).fetchall()
    return reconcile([
        ((row["connection_id"], row["thread_id"]), facts)
        for row in threads for facts in json.loads(row["facts_json"])
    ])
