"""Operator dashboard for the public Setlister workspaces."""

from calendar import monthrange
from datetime import datetime, timezone
from http import HTTPStatus
import json


SCHEMA = """
CREATE TABLE IF NOT EXISTS public_promo_access (
    band_id TEXT PRIMARY KEY REFERENCES public_bands(id) ON DELETE CASCADE,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_admin_audit (
    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, actor TEXT NOT NULL,
    action TEXT NOT NULL, target_id TEXT NOT NULL, band_id TEXT,
    reason TEXT NOT NULL, details_json TEXT NOT NULL
);
"""
PAGE_SIZE = 25
DIRECTORY = {
    "users": (
        """FROM public_users u""",
        """u.id, u.name, u.email, u.created_at AS createdAt,
            (SELECT COUNT(*) FROM public_band_members WHERE user_id=u.id) AS bandCount""",
        """(instr(casefold(u.name), :query) OR instr(casefold(u.email), :query))""",
        "u.created_at DESC, u.id",
    ),
    "bands": (
        """FROM public_bands b JOIN public_users u ON u.id=b.created_by
            LEFT JOIN public_promo_access p ON p.band_id=b.id""",
        """b.id, b.name, b.created_at AS createdAt, u.email AS ownerEmail, p.ends_at AS promoUntil,
            (SELECT COUNT(*) FROM public_band_members WHERE band_id=b.id) AS memberCount""",
        """(instr(casefold(b.name), :query) OR instr(casefold(u.email), :query))""",
        "b.created_at DESC, b.id",
    ),
}


class AdminError(ValueError):
    def __init__(self, message, status=HTTPStatus.BAD_REQUEST):
        super().__init__(message)
        self.status = status


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def initialize(database):
    database.executescript(SCHEMA)


def overview(database):
    return dict(database.execute("""
        SELECT (SELECT COUNT(*) FROM public_users) AS users,
            (SELECT COUNT(*) FROM public_bands) AS bands,
            (SELECT COUNT(*) FROM public_band_members) AS memberships,
            (SELECT COALESCE(SUM(json_array_length(state_json, '$.members')), 0)
                FROM public_band_state) AS stageMembers,
            (SELECT COUNT(*) FROM public_promo_access WHERE ends_at>?) AS promoBands
    """, (utc_now().isoformat(),)).fetchone())


def directory(database, kind, query, page):
    if kind not in DIRECTORY:
        raise AdminError("Neplatný seznam.")
    sql_from, fields, predicate, order = DIRECTORY[kind]
    params = {"query": query.strip().casefold()[:120], "limit": PAGE_SIZE + 1, "offset": page * PAGE_SIZE}
    database.create_function("casefold", 1, str.casefold, deterministic=True)
    rows = database.execute(f"""
        SELECT {fields} {sql_from}
        WHERE :query='' OR {predicate}
        ORDER BY {order} LIMIT :limit OFFSET :offset
    """, params).fetchall()
    return {"items": [dict(row) for row in rows[:PAGE_SIZE]], "more": len(rows) > PAGE_SIZE}


def user_detail(database, user_id):
    user = database.execute(
        "SELECT id, name, email, created_at AS createdAt FROM public_users WHERE id=?", (user_id,)).fetchone()
    if not user:
        raise AdminError("Účet nebyl nalezen.", HTTPStatus.NOT_FOUND)
    bands = database.execute("""
        SELECT b.id, b.name, m.role, b.created_by=u.id AS ownsBand
        FROM public_band_members m JOIN public_bands b ON b.id=m.band_id
        JOIN public_users u ON u.id=m.user_id WHERE u.id=? ORDER BY b.name
    """, (user_id,)).fetchall()
    return {**dict(user), "bands": [dict(row) for row in bands]}


def band_detail(database, band_id):
    band = database.execute("""
        SELECT b.id, b.name, b.created_by AS ownerId, b.created_at AS createdAt,
            s.updated_at AS updatedAt, p.starts_at AS promoStarts, p.ends_at AS promoUntil,
            sub.status AS planStatus, sub.current_period_end AS planUntil,
            json_array_length(s.state_json, '$.songs') AS songs,
            json_array_length(s.state_json, '$.members') AS stageMembers,
            json_array_length(s.state_json, '$.savedSetlists') AS setlists
        FROM public_bands b LEFT JOIN public_band_state s ON s.band_id=b.id
        LEFT JOIN public_promo_access p ON p.band_id=b.id
        LEFT JOIN public_subscriptions sub ON sub.band_id=b.id WHERE b.id=?
    """, (band_id,)).fetchone()
    if not band:
        raise AdminError("Kapela nebyla nalezena.", HTTPStatus.NOT_FOUND)
    members = database.execute("""
        SELECT u.id, u.name, u.email, m.role FROM public_users u
        JOIN public_band_members m ON m.user_id=u.id
        WHERE m.band_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.name
    """, (band_id,)).fetchall()
    mail = database.execute("""
        SELECT sync_state AS status, last_sync_at AS lastSync, message_count AS messages
        FROM public_gmail_connections WHERE band_id=? ORDER BY connected_at
    """, (band_id,)).fetchall()
    return {**dict(band), "members": [dict(row) for row in members],
            "mail": [dict(row) for row in mail]}


def support_preview(database, band_id, user_id):
    user = database.execute("""
        SELECT u.id, u.name, m.role
        FROM public_users u JOIN public_band_members m ON m.user_id=u.id
        WHERE u.id=? AND m.band_id=?
    """, (user_id, band_id)).fetchone()
    if not user:
        raise AdminError("Účet do této kapely nepatří.", HTTPStatus.NOT_FOUND)
    row = database.execute("""
        SELECT b.name, s.state_json, s.revision, s.updated_at FROM public_bands b
        JOIN public_band_state s ON b.id=s.band_id WHERE b.id=?
    """, (band_id,)).fetchone()
    if not row:
        raise AdminError("Kapela nemá dostupná data.", HTTPStatus.NOT_FOUND)
    state = json.loads(row["state_json"])
    member = next((item for item in state.get("members", []) if item.get("linkedUserId") == user_id), None)
    member_id = member["id"] if member else ""
    songs = [
        {**{key: song.get(key) for key in ("id", "title", "album", "seconds", "bpm", "archived", "printFields")},
         "personal": (song.get("memberDetails") or {}).get(member_id, {})}
        for song in state.get("songs", [])
    ]
    sets = [
        {key: item.get(key) for key in ("name", "songIds", "targetMinutes", "interludes")}
        for item in [state.get("draft", {}), *state.get("savedSetlists", [])]
    ]
    return {"bandName": row["name"], "user": dict(user), "member": member["name"] if member else None,
            "revision": row["revision"], "updatedAt": row["updated_at"], "songs": songs, "sets": sets}


def audit(database, actor, action, target_id, band_id, reason, details=None):
    database.execute("""
        INSERT INTO platform_admin_audit
            (created_at, actor, action, target_id, band_id, reason, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (utc_now().isoformat(), actor, action, target_id, band_id, reason,
          json.dumps(details or {}, ensure_ascii=False)))


def audit_list(database):
    return [dict(row) for row in database.execute("""
        SELECT created_at AS createdAt, actor, action, target_id AS targetId, band_id AS bandId, reason
        FROM platform_admin_audit ORDER BY id DESC LIMIT 100
    """)]


def grant_promo(database, band_id, months):
    if type(months) is not int or not 1 <= months <= 36:
        raise AdminError("Zadej 1 až 36 celých měsíců.")
    band = band_detail(database, band_id)
    now = utc_now()
    def period(value):
        if not value:
            return now
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    promo_end = period(band["promoUntil"])
    plan_end = period(band["planUntil"]) if band["planStatus"] in ("active", "trialing") else now
    base = max(now, promo_end, plan_end)
    start = period(band["promoStarts"]) if promo_end > now else base
    year, month = divmod(base.year * 12 + base.month - 1 + months, 12)
    month += 1
    end = base.replace(year=year, month=month, day=min(base.day, monthrange(year, month)[1]))
    window = {"startsAt": start.isoformat(), "endsAt": end.isoformat()}
    database.execute("""
        INSERT INTO public_promo_access VALUES (?, ?, ?)
        ON CONFLICT(band_id) DO UPDATE SET starts_at=excluded.starts_at, ends_at=excluded.ends_at
    """, (band_id, window["startsAt"], window["endsAt"]))
    return window


def transfer_band(database, band_id, user_id):
    band = band_detail(database, band_id)
    if user_id == band["ownerId"] or not any(member["id"] == user_id for member in band["members"]):
        raise AdminError("Vyber jiného registrovaného člena této kapely.")
    database.execute("UPDATE public_band_members SET role='member' WHERE band_id=? AND user_id=?",
                     (band_id, band["ownerId"]))
    database.execute("UPDATE public_band_members SET role='owner' WHERE band_id=? AND user_id=?", (band_id, user_id))
    database.execute("UPDATE public_bands SET created_by=? WHERE id=?", (user_id, band_id))
    return {"from": band["ownerId"], "to": user_id}


def delete_band(database, band_id, confirmation):
    band = band_detail(database, band_id)
    if confirmation != band["name"]:
        raise AdminError("Potvrzení musí přesně odpovídat názvu kapely.")
    payment = database.execute("""
        SELECT 1 FROM public_subscriptions WHERE band_id=? AND external_subscription_id IS NOT NULL
            AND status NOT IN ('canceled', 'expired')
    """, (band_id,)).fetchone()
    if payment:
        raise AdminError("Před smazáním je potřeba ukončit předplatné u poskytovatele platby.", HTTPStatus.CONFLICT)
    database.execute("DELETE FROM public_gmail_messages_fts WHERE band_id=?", (band_id,))
    database.execute("DELETE FROM public_bands WHERE id=?", (band_id,))


def delete_user(database, user_id, confirmation):
    user = user_detail(database, user_id)
    if confirmation != user["email"]:
        raise AdminError("Potvrzení musí přesně odpovídat e-mailu účtu.")
    if database.execute("SELECT 1 FROM public_bands WHERE created_by=?", (user_id,)).fetchone():
        raise AdminError("Nejdřív převeď vlastnictví nebo smaž kapely vedené tímto účtem.", HTTPStatus.CONFLICT)
    for band in user["bands"]:
        band_id = band["id"]
        row = database.execute("SELECT state_json FROM public_band_state WHERE band_id=?", (band_id,)).fetchone()
        if row:
            state = json.loads(row["state_json"])
            for member in state.get("members", []):
                if member.get("linkedUserId") == user_id:
                    member["linkedUserId"] = ""
            for task in state.get("tasks", []):
                if task.get("assigneeUserId") == user_id:
                    task["assigneeUserId"] = ""
            if "calendarEntries" in state:
                state["calendarEntries"] = [item for item in state["calendarEntries"] if item.get("userId") != user_id]
            database.execute("""
                UPDATE public_band_state SET state_json=?, revision=revision+1, updated_at=? WHERE band_id=?
            """, (json.dumps(state, ensure_ascii=False), utc_now().isoformat(), band_id))
        live = database.execute("SELECT state_json FROM public_live_sessions WHERE band_id=?", (band_id,)).fetchone()
        if live:
            state = json.loads(live["state_json"])
            changed = False
            if state.get("leaderUserId") == user_id:
                state.update(status="stopped", startedAtMs=0, leaderUserId="", leaderName="")
                changed = True
            live_set = state.get("liveSet") or {}
            if live_set.get("leaderUserId") == user_id:
                live_set.update(active=False, leaderUserId="", leaderName="")
                changed = True
            if changed:
                database.execute("""
                    UPDATE public_live_sessions SET state_json=?, revision=revision+1, updated_at=? WHERE band_id=?
                """, (json.dumps(state, ensure_ascii=False), utc_now().isoformat(), band_id))
    database.execute("DELETE FROM public_users WHERE id=?", (user_id,))
