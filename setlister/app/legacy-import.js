"use strict";

globalThis.SetlisterLegacyImport = (() => {
  function merge(source, current, instrumentCatalog) {
    if (source?.version !== 1 || !Array.isArray(source.members) || !Array.isArray(source.songs) ||
        !Array.isArray(source.savedSetlists) || !Array.isArray(source.draft?.songIds)) {
      throw new Error("Vyber zálohu JSON z původního Setlisteru.");
    }
    const state = structuredClone(current);
    const counts = { members: 0, songs: 0, sets: 0 };
    const normalize = value => String(value ?? "").trim().toLocaleLowerCase("cs");
    const legacyId = (type, id) => {
      if (typeof id !== "string" || !id.trim() || id.length > 130) throw new Error("Záloha obsahuje neplatný identifikátor.");
      return "legacy-" + type + "-" + id;
    };
    const memberMap = new Map();
    const songMap = new Map();
    const memberAliases = { saffer: "Petr", jay: "Jáchym", viktorka: "Viky" };
    const names = new Set(source.members.map(member => normalize(member?.name)));
    const isLegacyRoster = !["petr", "jáchym", "viky"].some(name => names.has(name));

    function addInstrument(member, name) {
      const key = normalize(name);
      if (!key || ["bez nástroje", "žádný", "zadny", "none", "zpěv"].includes(key)) return "none";
      const existing = member.instruments.find(item => normalize(item.name) === key);
      if (existing) return existing.id;
      const instrument = instrumentCatalog.find(item => normalize(item.name) === key) || {
        id: "legacy-instrument-" + encodeURIComponent(key),
        name: String(name).trim(),
        kind: "custom",
        usesCapo: key.includes("kytara") && !key.includes("bas")
      };
      member.instruments.push({ ...instrument });
      return instrument.id;
    }

    for (const original of source.members) {
      const id = legacyId("member", original?.id);
      const name = (isLegacyRoster && memberAliases[normalize(original.name)]) || String(original.name ?? "").trim();
      if (!name || memberMap.has(original.id)) throw new Error("Záloha obsahuje neplatné členy.");
      let member = state.members.find(item => item.id === id || normalize(item.name) === normalize(name));
      if (!member) {
        member = { id, name, instruments: [], defaultInstrumentId: "none", vocals: false, linkedUserId: "" };
        state.members.push(member);
        counts.members += 1;
      }
      for (const instrument of Array.isArray(original.instruments) ? original.instruments : []) {
        if (normalize(instrument) === "zpěv") member.vocals = true;
        else addInstrument(member, instrument);
      }
      const oldDefault = addInstrument(member, original.defaultInstrument || original.instruments?.[0]);
      if (!member.defaultInstrumentId || member.defaultInstrumentId === "none") member.defaultInstrumentId = oldDefault;
      memberMap.set(original.id, { member, oldDefault });
    }

    for (const original of source.songs) {
      const id = legacyId("song", original?.id);
      const title = String(original.title ?? "").trim();
      const seconds = Number(original.durationSec ?? 0);
      if (!title || !Number.isInteger(seconds) || seconds < 0 || seconds > 3600 || songMap.has(original.id)) {
        throw new Error("Záloha obsahuje skladbu s neplatným názvem nebo délkou.");
      }
      songMap.set(original.id, id);
      if (state.songs.some(song => song.id === id)) continue;
      const memberDetails = {};
      for (const [memberId, { member, oldDefault }] of memberMap) {
        const detail = original.memberNotes?.[memberId] || {};
        const instrumentId = detail.instrument ? addInstrument(member, detail.instrument) : oldDefault;
        const capo = /^K([0-9]|1[0-2])$/i.exec(String(detail.capo ?? "").trim());
        const entry = {
          instrumentId: detail.instrument || instrumentId !== member.defaultInstrumentId ? instrumentId : "",
          capo: Number(capo?.[1] || 0), preset: String(detail.sound || ""),
          note: String(detail.text || ""), customTitle: String(detail.alias || "")
        };
        if (Object.values(entry).some(Boolean)) memberDetails[member.id] = entry;
      }
      const roles = Array.isArray(original.vibeRoles) ? original.vibeRoles.filter(role => ["opener", "encore", "closer"].includes(role)) : [];
      const starters = Array.isArray(original.starterMemberIds) ? original.starterMemberIds : [original.starterMemberId];
      const starterIds = [...new Set(starters.map(memberId => memberMap.get(memberId)?.member.id).filter(Boolean))];
      state.songs.push({
        id, title, album: String(original.album || "").trim(), seconds, durationUnknown: seconds === 0,
        energy: Math.max(1, Math.min(5, Math.round(Number(original.energy) || 3))), role: roles[0] || "standard",
        vibeRoles: roles, archived: Boolean(original.archived), starterMemberIds: starterIds, memberDetails
      });
      counts.songs += 1;
    }

    function addSet(original, id, fallbackName) {
      if (state.savedSetlists.some(item => item.id === id)) return;
      if (!Array.isArray(original?.songIds)) throw new Error("Záloha obsahuje neplatný setlist.");
      const songIds = [];
      const interludes = [];
      for (const [index, oldId] of original.songIds.entries()) {
        const songId = songMap.get(oldId);
        if (songId) songIds.push(songId);
        else if (Object.hasOwn(original.interludes || {}, oldId)) {
          const pause = original.interludes[oldId];
          interludes.push({
            id: "legacy-pause-" + index, title: String(pause?.title || "Pauza").trim() || "Pauza",
            seconds: Number(pause?.durationSec) || 0, position: songIds.length
          });
        } else throw new Error("V záloze chybí skladba nebo pauza odkazovaná ze setlistu.");
      }
      state.savedSetlists.push({
        id, name: String(original.name || "").trim() || fallbackName,
        targetMinutes: original.targetMinutes === "" || original.targetMinutes === null
          ? null : Math.max(1, Number(original.targetMinutes) || 45),
        songIds, interludes, includeGaps: Boolean(original.includeGaps)
      });
      counts.sets += 1;
    }
    for (const set of source.savedSetlists) addSet(set, legacyId("set", set?.id), "Setlist z původní aplikace");
    const savedDraft = source.savedSetlists.find(set => set.id === source.draft.savedId);
    if (source.draft.songIds.length && (!savedDraft || savedDraft.name !== source.draft.name ||
        savedDraft.targetMinutes !== source.draft.targetMinutes ||
        Boolean(savedDraft.includeGaps) !== Boolean(source.draft.includeGaps) ||
        JSON.stringify(savedDraft.songIds) !== JSON.stringify(source.draft.songIds) ||
        JSON.stringify(savedDraft.interludes || {}) !== JSON.stringify(source.draft.interludes || {}))) {
      addSet({ ...source.draft, name: "" }, "legacy-draft", source.draft.name ? source.draft.name + " (rozpracováno)" : "Rozpracovaný set z původní aplikace");
    }
    return { state, counts };
  }
  return { merge };
})();
