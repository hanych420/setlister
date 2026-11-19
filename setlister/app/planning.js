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

  return { readinessLabels, dateKey, parseDate, dateFromKey, calendarDays, readiness, buildPlan };
})();
