"""Serialize the shared events Setlister exposes via a calendar subscription."""

from datetime import date, datetime, timedelta, timezone
import hashlib
import re
from zoneinfo import ZoneInfo


def valid_day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return False
    return 1900 <= day.year and day < date.max


CLOCK_PATTERN = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d")


def planned_show_end(event):
    if "showDurationMinutes" not in event:
        return str(event.get("showEnd") or "")
    duration = event["showDurationMinutes"]
    start = str(event.get("showStart") or "")
    if type(duration) is not int or not 1 <= duration < 1440 or not CLOCK_PATTERN.fullmatch(start):
        return ""
    hour, minute = map(int, start.split(":"))
    end = (hour * 60 + minute + duration) % 1440
    return f"{end // 60:02d}:{end % 60:02d}"


def text(value):
    return (str(value).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n"))


def fold(value):
    lines = [""]
    size = 0
    for character in value:
        char_size = len(character.encode("utf-8"))
        if size + char_size > 75:
            lines.append(" ")
            size = 1
        lines[-1] += character
        size += char_size
    return "\r\n".join(lines)


def calendar_feed(band_id, band_name, state, updated_at, names):
    local = ZoneInfo("Europe/Prague")
    updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    stamp = updated.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Setlister//Kapelni kalendar//CS",
              "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + text(band_name)]

    def add(kind, item, title, start, end, location="", clock_start="", clock_end=""):
        if not valid_day(start) or not valid_day(end) or end < start or not title:
            return
        identity = hashlib.sha256(f"{band_id}/{kind}/{item['id']}".encode()).hexdigest()
        output.extend(["BEGIN:VEVENT", f"UID:{identity}@setlister.cz", "DTSTAMP:" + stamp,
                       "LAST-MODIFIED:" + stamp, "SUMMARY:" + text(title)])
        if location:
            output.append("LOCATION:" + text(location))
        if CLOCK_PATTERN.fullmatch(clock_start):
            starts_at = datetime.fromisoformat(start + "T" + clock_start).replace(tzinfo=local)
            output.append("DTSTART:" + starts_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
            if CLOCK_PATTERN.fullmatch(clock_end):
                ends_at = datetime.fromisoformat(end + "T" + clock_end).replace(tzinfo=local)
                if ends_at < starts_at:
                    ends_at += timedelta(days=1)
                if ends_at > starts_at:
                    output.append("DTEND:" + ends_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        else:
            output.extend(["DTSTART;VALUE=DATE:" + date.fromisoformat(start).strftime("%Y%m%d"),
                           "DTEND;VALUE=DATE:" + (date.fromisoformat(end) + timedelta(days=1)).strftime("%Y%m%d")])
        output.append("END:VEVENT")

    for event in state.get("events", []):
        day = event.get("date")
        location = ", ".join(str(event[key]) for key in ("venue", "address", "city") if event.get(key))
        add("concert", event, event.get("name"), day, day, location,
            str(event.get("showStart") or ""), planned_show_end(event))
    for entry in state.get("calendarEntries", []):
        name = names.get(entry["userId"], "")
        title = f"{entry['title']} ({name})" if name else entry["title"]
        add("member", entry, title, entry["startDate"], entry["endDate"])
    output.append("END:VCALENDAR")
    return ("\r\n".join(fold(line) for line in output) + "\r\n").encode("utf-8")
