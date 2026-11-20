"use strict";

const SetlisterPlanning = (() => {
  const readinessLabels = Object.freeze({
    ready: "Připraveno",
    practice: "Dopilovat",
    unlearned: "Nenacvičeno",
  });

  function dateKey(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
  }

  function parseDate(value) {
    const text = String(value || "").trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const local = text.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/);
    if (!iso && !local) return "";
    const [year, month, day] = (iso ? [iso[1], iso[2], iso[3]] : [local[3], local[2], local[1]]).map(Number);
    if (year < 1900 || year > 9999) return "";
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? dateKey(date) : "";
  }

  function dateFromKey(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const pragueDay = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  });

  function concertDayKey(now = new Date()) {
    return pragueDay.format(now);
  }

  function concertStatus(event, today = concertDayKey()) {
    if (!event) return "planned";
    const day = parseDate(event.date);
    return event.status === "completed" || (day && day < today) ? "completed" : "planned";
  }

  function venueSearchText(value) {
    return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("cs")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function venueSuggestions(value, catalog) {
    const query = venueSearchText(value);
    if (!query) return [];
    const terms = query.split(" ");
    const matches = [];
    for (const venue of catalog) {
      const name = venueSearchText(venue.name);
      const searchable = [name, ...[venue.city, venue.address, venue.region, venue.postalCode].map(venueSearchText)].join(" ");
      if (!terms.every(term => searchable.includes(term))) continue;
      const nameMatches = terms.filter(term => name.includes(term)).length;
      const rank = name === query ? 0 : name.startsWith(query) ? 1 : nameMatches === terms.length ? 2 : nameMatches ? 3 : 4;
      matches.push({ venue, rank });
    }
    return matches
      .sort((a, b) => a.rank - b.rank
        || a.venue.name.localeCompare(b.venue.name, "cs") || a.venue.city.localeCompare(b.venue.city, "cs"))
      .slice(0, 8).map(match => match.venue);
  }

  function clockMinutes(value) {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function showDuration(event) {
    if (!event) return null;
    if (Object.hasOwn(event, "showDurationMinutes")) return event.showDurationMinutes;
    const start = clockMinutes(event.showStart);
    const end = clockMinutes(event.showEnd);
    if (start === null || end === null) return null;
    return (1440 + end - start) % 1440 || null;
  }

  function showEnd(start, duration) {
    const minutes = clockMinutes(start);
    if (minutes === null || !Number.isInteger(duration) || duration < 1 || duration >= 1440) return null;
    const end = minutes + duration;
    const time = [Math.floor(end / 60) % 24, end % 60].map(part => String(part).padStart(2, "0")).join(":");
    return { time, nextDay: end >= 1440 };
  }

  function calendarDays(month) {
    const year = month.getFullYear();
    const number = month.getMonth();
    const leading = (new Date(year, number, 1).getDay() + 6) % 7;
    const count = new Date(year, number + 1, 0).getDate();
    const cells = Math.ceil((leading + count) / 7) * 7;
    return Array.from({ length: cells }, (_, index) => new Date(year, number, index - leading + 1));
  }

  function readiness(song, members) {
    const groups = { ready: [], practice: [], unlearned: [], unknown: [] };
    for (const member of members) {
      const value = song.readiness?.[member.id];
      groups[Object.hasOwn(readinessLabels, value) ? value : "unknown"].push(member);
    }
    return groups;
  }

  function buildPlan(songs, members, minutes) {
    const budget = minutes * 60;
    const ranked = songs.map((song, order) => {
      const state = readiness(song, members);
      const priority = state.unlearned.length * 4 + state.practice.length * 2;
      const duration = song.seconds + (state.unlearned.length ? 180 : state.practice.length ? 120 : state.unknown.length ? 60 : 0);
      return { song, order, state, priority, duration };
    }).sort((a, b) => b.priority - a.priority
      || b.state.unlearned.length - a.state.unlearned.length
      || b.state.unknown.length - a.state.unknown.length
      || a.order - b.order);

    const items = [];
    let total = 0;
    let omittedPriority = 0;
    for (const item of ranked) {
      if (total + item.duration > budget) {
        if (item.priority) omittedPriority += 1;
        continue;
      }
      // Keep time for the work on a known weak song instead of filling it with run-throughs.
      if (omittedPriority && !item.priority) continue;
      items.push(item);
      total += item.duration;
    }
    return { items, total, omittedPriority };
  }

  function setlistEntries(set) {
    const songIds = Array.isArray(set.songIds) ? set.songIds : [];
    const slots = Array.from({ length: songIds.length + 1 }, () => []);
    for (const interlude of Array.isArray(set.interludes) ? set.interludes : []) {
      if (!Number.isInteger(interlude?.position)) continue;
      const position = Math.max(0, Math.min(songIds.length, interlude.position));
      slots[position].push({ ...interlude, kind: "interlude" });
    }
    return slots.flatMap((interludes, position) => position < songIds.length
      ? [...interludes, { kind: "song", id: songIds[position] }]
      : interludes);
  }

  function updateSetlistEntries(set, entries) {
    const songIds = [];
    const interludes = [];
    for (const entry of entries) {
      if (entry.kind === "song") {
        songIds.push(entry.id);
      } else {
        const { id, title, seconds } = entry;
        interludes.push({ id, title, seconds, position: songIds.length });
      }
    }
    Object.assign(set, { songIds, interludes });
  }

  function usesCapo(instrument) {
    return instrument?.kind === "guitar" || instrument?.kind === "electric-guitar"
      || (instrument?.kind === "custom" && instrument.usesCapo === true);
  }

  function tuningPlan(songs, member, resolveInstrument) {
    if (!member) return [];
    const capoByInstrument = new Map();
    return songs.map(song => {
      const detail = song?.memberDetails?.[member.id] || {};
      const instrument = resolveInstrument(member, detail.instrumentId || member.defaultInstrumentId || "none");
      if (!usesCapo(instrument)) return "";
      const capo = Number(detail.capo) || 0;
      const previous = capoByInstrument.get(instrument.id);
      capoByInstrument.set(instrument.id, capo);
      if (previous !== undefined && previous !== capo) return instrument.name + " · K" + previous + " → K" + capo;
      return detail.manualTuning ? instrument.name : "";
    });
  }

  return { readinessLabels, dateKey, parseDate, dateFromKey, calendarDays, readiness, buildPlan,
    setlistEntries, updateSetlistEntries, usesCapo, tuningPlan, concertDayKey, concertStatus, showDuration, showEnd,
    venueSuggestions };
})();
