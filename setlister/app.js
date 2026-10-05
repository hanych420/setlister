(() => {
  "use strict";

  const STORAGE_KEY = "setlister-v1";
  const LEGACY_STORAGE_KEY = "kapelnik-setlist-v1";
  const MEMBER_PROFILES = [
    { id: "member-hanych", name: "Hanych", instruments: ["Elektrická kytara", "Akustická kytara"], capoInstruments: ["Elektrická kytara", "Akustická kytara"] },
    { id: "member-jachym", name: "Jáchym", instruments: ["Bicí"], capoInstruments: [] },
    { id: "member-petr", name: "Petr", instruments: ["Akustická kytara", "Elektrická kytara"], capoInstruments: ["Akustická kytara", "Elektrická kytara"] },
    { id: "member-koby", name: "Koby", instruments: ["Akustická kytara", "Klávesy"], capoInstruments: ["Akustická kytara"] },
    { id: "member-bruno", name: "Bruno", instruments: ["Baskytara"], capoInstruments: [] },
    { id: "member-viky", name: "Viky", instruments: ["Housle"], capoInstruments: [] }
  ];
  const DEFAULT_MEMBERS = MEMBER_PROFILES.map(({ id, name, instruments }) => ({
    id,
    name,
    instruments: [...instruments],
    defaultInstrument: instruments[0]
  }));
  const GENERIC_INSTRUMENTS = ["Akustická kytara", "Elektrická kytara", "Bicí", "Baskytara", "Klávesy", "Housle"];
  const DEFAULT_SONG_TITLES = [
    "A kdybys věděla", "Aby bylo o čem", "Amigo", "Aragog", "Balón",
    "Bláznivé děti", "Boneš", "Chlastej", "Dobré játro pane Škváro",
    "Druhá tvář", "GAC", "Hmyzí život", "Houpací lavice", "Inspirace",
    "Intro 1", "Intro 2", "Intro 3", "Jarka Veselá", "Jsem zkouřený",
    "Kdo je Hanych", "Kokot", "Kukuřice", "Máří", "Mešuge", "Míříš dál",
    "Nekonečný valčík", "Neřeš", "Netopýr", "Nouzový signály", "Oceán",
    "Ona", "Opozdilec", "Pátek třináctého", "Pes", "Pod pantoflí",
    "Podívej se", "Prokletí", "Přestaň pít_", "Skvělý", "Slimák",
    "Sněhulák", "Starý intro", "Superhrdina", "Svět záhad", "Šmouha",
    "Táborový blues", "Tetování", "Tonda", "Ty mi za to stojíš", "V hrsti",
    "V létě nám bylo líp", "VCM", "Vážená", "Věř", "Zapomenout",
    "Zastávka snů", "Život", "zpěvník"
  ];

  const elements = {
    setName: document.querySelector("#setName"),
    targetMinutes: document.querySelector("#targetMinutes"),
    saveSet: document.querySelector("#saveSet"),
    newSet: document.querySelector("#newSet"),
    songSearch: document.querySelector("#songSearch"),
    albumFilter: document.querySelector("#albumFilter"),
    showArchived: document.querySelector("#showArchived"),
    songLibrary: document.querySelector("#songLibrary"),
    songLibraryCount: document.querySelector("#songLibraryCount"),
    addSong: document.querySelector("#addSong"),
    bulkAdd: document.querySelector("#bulkAdd"),
    bulkImport: document.querySelector("#bulkImport"),
    bulkImportFile: document.querySelector("#bulkImportFile"),
    currentSet: document.querySelector(".current-set"),
    setList: document.querySelector("#setList"),
    emptySet: document.querySelector("#emptySet"),
    totalTime: document.querySelector("#totalTime"),
    targetStatus: document.querySelector("#targetStatus"),
    progressBar: document.querySelector("#progressBar"),
    setCount: document.querySelector("#setCount"),
    timeDifference: document.querySelector("#timeDifference"),
    unknownDurations: document.querySelector("#unknownDurations"),
    clearSet: document.querySelector("#clearSet"),
    exportSet: document.querySelector("#exportSet"),
    savedSets: document.querySelector("#savedSets"),
    manageMembers: document.querySelector("#manageMembers"),
    exportData: document.querySelector("#exportData"),
    importData: document.querySelector("#importData"),
    songDialog: document.querySelector("#songDialog"),
    songForm: document.querySelector("#songForm"),
    songDialogTitle: document.querySelector("#songDialogTitle"),
    songTitle: document.querySelector("#songTitle"),
    songAlbum: document.querySelector("#songAlbum"),
    albumSuggestions: document.querySelector("#albumSuggestions"),
    songMinutes: document.querySelector("#songMinutes"),
    songSeconds: document.querySelector("#songSeconds"),
    songError: document.querySelector("#songError"),
    archiveSong: document.querySelector("#archiveSong"),
    bulkDialog: document.querySelector("#bulkDialog"),
    bulkForm: document.querySelector("#bulkForm"),
    bulkSongs: document.querySelector("#bulkSongs"),
    bulkError: document.querySelector("#bulkError"),
    notesDialog: document.querySelector("#notesDialog"),
    notesForm: document.querySelector("#notesForm"),
    notesSongTitle: document.querySelector("#notesSongTitle"),
    memberTabs: document.querySelector("#memberTabs"),
    noteCapoField: document.querySelector("#noteCapoField"),
    noteCapo: document.querySelector("#noteCapo"),
    noteInstrumentField: document.querySelector("#noteInstrumentField"),
    noteInstrument: document.querySelector("#noteInstrument"),
    noteSoundField: document.querySelector("#noteSoundField"),
    noteSound: document.querySelector("#noteSound"),
    noteText: document.querySelector("#noteText"),
    noteTransitionHelp: document.querySelector("#noteTransitionHelp"),
    membersDialog: document.querySelector("#membersDialog"),
    membersForm: document.querySelector("#membersForm"),
    memberRows: document.querySelector("#memberRows"),
    addMember: document.querySelector("#addMember"),
    membersError: document.querySelector("#membersError"),
    exportDialog: document.querySelector("#exportDialog"),
    exportForm: document.querySelector("#exportForm"),
    exportMembersFieldset: document.querySelector("#exportMembersFieldset"),
    exportMemberList: document.querySelector("#exportMemberList"),
    cleanCopyCount: document.querySelector("#cleanCopyCount"),
    exportError: document.querySelector("#exportError"),
    downloadPrintFile: document.querySelector("#downloadPrintFile"),
    printArea: document.querySelector("#printArea"),
    syncStatus: document.querySelector("#syncStatus"),
    toast: document.querySelector("#toast")
  };

  let state = loadState();
  let serverRevision = 0;
  let serverSyncEnabled = false;
  let serverSyncTimer = null;
  let serverSyncInFlight = false;
  let serverSyncQueued = false;
  let lastSyncedState = "";
  let editingSongId = null;
  let draggedItem = null;
  let toastTimer = null;
  let notesEditingSongId = null;
  let activeNotesMemberId = null;
  let pendingMemberNotes = {};
  let membersDraft = [];
  let exportCleanCopiesEdited = false;

  function makeId(prefix = "id") {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function createInitialState() {
    return {
      version: 1,
      songs: DEFAULT_SONG_TITLES.map((title, index) => ({
        id: `song-default-${index + 1}`,
        title,
        durationSec: 0,
        album: "",
        archived: false,
        memberNotes: {}
      })),
      draft: {
        savedId: null,
        name: "",
        targetMinutes: 45,
        songIds: []
      },
      savedSetlists: [],
      members: DEFAULT_MEMBERS.map(member => ({ ...member, instruments: [...member.instruments] }))
    };
  }

  function isValidState(value) {
    return value && value.version === 1 && Array.isArray(value.songs) &&
      value.draft && Array.isArray(value.draft.songIds) && Array.isArray(value.savedSetlists);
  }

  function normalizeState(value) {
    let normalizedMembers = Array.isArray(value.members) && value.members.length
      ? value.members
        .filter(member => member && typeof member.id === "string")
        .map(member => ({ ...member, id: member.id, name: String(member.name || "").trim() }))
        .filter(member => member.name)
      : DEFAULT_MEMBERS.map(member => ({ ...member, instruments: [...member.instruments] }));
    const memberNames = new Set(normalizedMembers.map(member => member.name.toLocaleLowerCase("cs-CZ")));
    const hasLegacyRoster = ["saffer", "jay", "viktorka"].some(name => memberNames.has(name))
      && !["petr", "jáchym", "viky"].some(name => memberNames.has(name));
    if (hasLegacyRoster) {
      const legacyNames = { saffer: "Petr", jay: "Jáchym", viktorka: "Viky" };
      normalizedMembers = normalizedMembers.map(member => ({
        ...member,
        name: legacyNames[member.name.toLocaleLowerCase("cs-CZ")] || member.name
      }));
    }
    const preferredOrder = new Map(MEMBER_PROFILES.map((profile, index) => [profile.name.toLocaleLowerCase("cs-CZ"), index]));
    value.members = normalizedMembers.map(member => {
      const configured = MEMBER_PROFILES.find(profile =>
        profile.name.toLocaleLowerCase("cs-CZ") === member.name.toLocaleLowerCase("cs-CZ"));
      const instruments = [...new Set((Array.isArray(member.instruments) && member.instruments.length
        ? member.instruments
        : configured?.instruments || ["Zpěv"])
        .map(instrument => String(instrument || "").trim())
        .filter(Boolean))];
      const savedDefault = String(member.defaultInstrument || "").trim();
      const defaultInstrument = instruments.find(instrument => sameInstrument(instrument, savedDefault)) || instruments[0];
      return { ...member, instruments, defaultInstrument };
    }).sort((a, b) =>
      (preferredOrder.get(a.name.toLocaleLowerCase("cs-CZ")) ?? 999)
      - (preferredOrder.get(b.name.toLocaleLowerCase("cs-CZ")) ?? 999));
    const songIds = new Set(value.songs.map(song => song.id));
    value.songs = value.songs
      .filter(song => song && typeof song.id === "string" && typeof song.title === "string")
      .map(song => ({
        ...song,
        durationSec: Math.max(0, Number(song.durationSec) || 0),
        album: String(song.album || "").trim(),
        archived: Boolean(song.archived),
        memberNotes: normalizeMemberNotes(song.memberNotes)
      }));
    value.draft.targetMinutes = Math.max(1, Number(value.draft.targetMinutes) || 45);
    value.draft.name = String(value.draft.name || "");
    value.draft.songIds = value.draft.songIds.filter(id => songIds.has(id));
    value.savedSetlists = value.savedSetlists.map(set => ({
      ...set,
      name: String(set.name || "Bez názvu"),
      targetMinutes: Math.max(1, Number(set.targetMinutes) || 45),
      songIds: Array.isArray(set.songIds) ? set.songIds.filter(id => songIds.has(id)) : []
    }));
    return value;
  }

  function loadState() {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const stored = JSON.parse(serialized);
      if (isValidState(stored)) {
        const normalized = normalizeState(stored);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch (error) {
      console.warn("Uložená data se nepodařilo načíst.", error);
    }
    return createInitialState();
  }

  function saveState() {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
    if (serverSyncEnabled && serialized !== lastSyncedState) scheduleServerSync();
  }

  function setSyncStatus(label, stateName) {
    elements.syncStatus.textContent = label;
    elements.syncStatus.dataset.state = stateName;
  }

  function scheduleServerSync(delay = 350) {
    clearTimeout(serverSyncTimer);
    serverSyncTimer = setTimeout(flushServerState, delay);
  }

  async function readServerState() {
    const response = await fetch("/api/state", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Server odpověděl ${response.status}.`);
    return response.json();
  }

  async function applyServerState(payload, announce = false) {
    if (!payload?.state || !isValidState(payload.state)) return false;
    state = normalizeState(payload.state);
    serverRevision = Number(payload.revision) || 0;
    lastSyncedState = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, lastSyncedState);
    renderAll();
    if (announce) showToast("Načtena novější verze ze sdílené databáze.");
    return true;
  }

  async function refreshServerState(announce = false) {
    if (!serverSyncEnabled || serverSyncInFlight || serverSyncTimer || document.querySelector("dialog[open]")) return;
    try {
      const payload = await readServerState();
      if ((Number(payload.revision) || 0) > serverRevision) await applyServerState(payload, announce);
      setSyncStatus("Sdíleno", "online");
    } catch (error) {
      setSyncStatus("Server nedostupný", "offline");
    }
  }

  async function flushServerState() {
    serverSyncTimer = null;
    if (!serverSyncEnabled) return;
    if (serverSyncInFlight) {
      serverSyncQueued = true;
      return;
    }
    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedState) return;
    serverSyncInFlight = true;
    setSyncStatus("Ukládám…", "saving");
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ baseRevision: serverRevision, state: JSON.parse(serialized) })
      });
      if (response.status === 409) {
        const conflict = await response.json();
        serverRevision = Number(conflict.revision) || serverRevision;
        const latest = await readServerState();
        await applyServerState(latest);
        showToast("Setlister se mezitím změnil na jiném zařízení. Načetl jsem novější verzi; poslední úpravu prosím zopakuj.");
        return;
      }
      if (!response.ok) throw new Error(`Server odpověděl ${response.status}.`);
      const result = await response.json();
      serverRevision = Number(result.revision) || serverRevision;
      lastSyncedState = serialized;
      setSyncStatus("Sdíleno", "online");
    } catch (error) {
      console.warn("Sdílenou databázi se nepodařilo uložit.", error);
      setSyncStatus("Neuloženo na server", "offline");
    } finally {
      serverSyncInFlight = false;
      if (serverSyncQueued || JSON.stringify(state) !== lastSyncedState) {
        serverSyncQueued = false;
        scheduleServerSync(150);
      }
    }
  }

  async function initializeSharedState() {
    if (!/^https?:$/.test(location.protocol)) {
      setSyncStatus("Lokální režim", "local");
      return;
    }
    setSyncStatus("Připojuji…", "connecting");
    try {
      const payload = await readServerState();
      serverRevision = Number(payload.revision) || 0;
      serverSyncEnabled = true;
      if (!(await applyServerState(payload))) {
        lastSyncedState = "";
        await flushServerState();
      }
      setSyncStatus("Sdíleno", "online");
      window.setInterval(() => refreshServerState(true), 10000);
      window.addEventListener("focus", () => refreshServerState(true));
    } catch (error) {
      console.warn("Sdílená databáze není dostupná; Setlister pokračuje lokálně.", error);
      setSyncStatus("Pouze lokálně", "offline");
    }
  }

  function commit({ library = false, saved = false } = {}) {
    saveState();
    renderCurrentSet();
    if (library) renderLibrary();
    if (saved) renderSavedSets();
  }

  function songById(id) {
    return state.songs.find(song => song.id === id);
  }

  function memberById(id) {
    return state.members.find(member => member.id === id);
  }

  function profileForMember(member) {
    const configured = MEMBER_PROFILES.find(candidate =>
      candidate.name.toLocaleLowerCase("cs-CZ") === member?.name?.toLocaleLowerCase("cs-CZ"));
    const instruments = Array.isArray(member?.instruments) && member.instruments.length
      ? member.instruments
      : configured?.instruments || GENERIC_INSTRUMENTS;
    const defaultInstrument = instruments.find(instrument => sameInstrument(instrument, member?.defaultInstrument))
      || configured?.instruments?.[0]
      || instruments[0]
      || "";
    return {
      instruments,
      defaultInstrument,
      capoInstruments: instruments.filter(instrument =>
        sameInstrument(instrument, "Akustická kytara") || sameInstrument(instrument, "Elektrická kytara"))
    };
  }

  function sameInstrument(first, second) {
    return String(first || "").toLocaleLowerCase("cs-CZ") === String(second || "").toLocaleLowerCase("cs-CZ");
  }

  function instrumentUsesCapo(member, instrument) {
    return profileForMember(member).capoInstruments.some(candidate => sameInstrument(candidate, instrument));
  }

  function instrumentUsesSound(instrument) {
    return sameInstrument(instrument, "Elektrická kytara");
  }

  function normalizeCapo(value) {
    const capo = String(value || "K0").trim().toUpperCase();
    return /^K(?:[0-9]|1[0-2])$/.test(capo) ? capo : "K0";
  }

  function normalizeNote(note) {
    return {
      capo: normalizeCapo(note?.capo),
      instrument: String(note?.instrument || "").trim(),
      sound: String(note?.sound || "").trim(),
      text: String(note?.text || "").trim()
    };
  }

  function normalizeMemberNotes(notes) {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) return {};
    return Object.fromEntries(Object.entries(notes).map(([memberId, note]) => [memberId, normalizeNote(note)]));
  }

  function noteHasContent(note) {
    const normalized = normalizeNote(note);
    return Boolean(normalized.capo !== "K0" || normalized.instrument || normalized.sound || normalized.text);
  }

  function songNoteCount(song) {
    return state.members.filter(member => noteHasContent(song.memberNotes?.[member.id])).length;
  }

  function transitionPlanForMember(songs, member) {
    const profile = profileForMember(member);
    const plan = songs.map(() => ({ changes: [], instrument: "" }));
    const capoByInstrument = new Map();
    let activeInstrument = profile.defaultInstrument;

    songs.forEach((song, index) => {
      const note = normalizeNote(song.memberNotes?.[member.id]);
      const requestedInstrument = note.instrument;
      const currentInstrument = requestedInstrument || activeInstrument || profile.defaultInstrument;
      plan[index].instrument = currentInstrument;
      const instrumentKey = currentInstrument
        ? currentInstrument.toLocaleLowerCase("cs-CZ")
        : "__bez_nastroje__";

      if (
        index > 0
        && requestedInstrument
        && activeInstrument
        && !sameInstrument(requestedInstrument, activeInstrument)
      ) {
        plan[index].changes.push(`výměna nástroje ${activeInstrument} → ${requestedInstrument}`);
      }

      if (instrumentUsesCapo(member, currentInstrument)) {
        const previousCapo = capoByInstrument.get(instrumentKey);
        if (index > 0 && previousCapo !== undefined && previousCapo !== note.capo) {
          plan[index].changes.push(`ladění kytary ${previousCapo} → ${note.capo}`);
        }
        capoByInstrument.set(instrumentKey, note.capo);
      }

      if (requestedInstrument) activeInstrument = requestedInstrument;
    });

    return plan;
  }

  function allTransitionPlans(songs) {
    return new Map(state.members.map(member => [member.id, transitionPlanForMember(songs, member)]));
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function songCountLabel(count) {
    if (count === 1) return "1 skladba";
    if (count >= 2 && count <= 4) return `${count} skladby`;
    return `${count} skladeb`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
  }

  function createIconButton(label, title, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `song-icon-button ${className}`.trim();
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    return button;
  }

  function renderLibrary() {
    const query = elements.songSearch.value.trim().toLocaleLowerCase("cs");
    const selectedAlbum = elements.albumFilter.value;
    const showArchived = elements.showArchived.checked;
    const inSet = new Set(state.draft.songIds);
    const albums = [...new Set(state.songs.map(song => song.album).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "cs"));

    elements.albumSuggestions.replaceChildren();
    albums.forEach(album => {
      const option = document.createElement("option");
      option.value = album;
      elements.albumSuggestions.append(option);
    });

    const currentAlbum = albums.includes(selectedAlbum) ? selectedAlbum : "";
    elements.albumFilter.replaceChildren();
    const allAlbums = document.createElement("option");
    allAlbums.value = "";
    allAlbums.textContent = "Všechna alba";
    elements.albumFilter.append(allAlbums);
    albums.forEach(album => {
      const option = document.createElement("option");
      option.value = album;
      option.textContent = album;
      elements.albumFilter.append(option);
    });
    elements.albumFilter.value = currentAlbum;

    const visibleSongs = [...state.songs]
      .filter(song => !inSet.has(song.id))
      .filter(song => showArchived || !song.archived)
      .filter(song => !currentAlbum || song.album === currentAlbum)
      .filter(song => song.title.toLocaleLowerCase("cs").includes(query))
      .sort((a, b) => a.title.localeCompare(b.title, "cs"));

    elements.songLibrary.replaceChildren();
    elements.songLibraryCount.textContent = String(visibleSongs.length);

    if (!visibleSongs.length) {
      const empty = document.createElement("p");
      empty.className = "empty-saved";
      empty.textContent = query
        ? "Tomuto hledání žádná píseň neodpovídá."
        : state.draft.songIds.length
          ? "Všechny dostupné písničky už jsou v aktuálním setu."
          : "Knihovna je prázdná.";
      elements.songLibrary.append(empty);
      return;
    }

    visibleSongs.forEach(song => {
      const item = document.createElement("article");
      item.className = `library-song${song.archived ? " archived" : ""}`;
      item.draggable = true;
      item.dataset.songId = song.id;

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      handle.setAttribute("aria-hidden", "true");

      const info = document.createElement("div");
      info.className = "song-info";
      const title = document.createElement("strong");
      title.textContent = song.title;
      const duration = document.createElement("small");
      const durationText = song.durationSec ? formatTime(song.durationSec) : "Délka nezadaná";
      duration.textContent = `${song.album || "Bez alba"} · ${durationText}`;
      info.append(title, duration);
      if (song.archived) {
        const archived = document.createElement("small");
        archived.className = "archive-badge";
        archived.textContent = "Archivovaná";
        info.append(archived);
      }

      const edit = createIconButton("✎", `Upravit ${song.title}`);
      edit.addEventListener("click", () => openSongDialog(song));

      const noteCount = songNoteCount(song);
      const notes = createIconButton("☷", `Poznámky členů ke skladbě ${song.title}`, `notes${noteCount ? " has-notes" : ""}`);
      if (noteCount) notes.dataset.count = noteCount;
      notes.addEventListener("click", () => openNotesDialog(song));

      const add = createIconButton("+", `Přidat ${song.title} do setu`, "add");
      add.addEventListener("click", () => addSongToSet(song.id));

      item.addEventListener("dragstart", event => {
        draggedItem = { type: "library", songId: song.id };
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", song.id);
        requestAnimationFrame(() => item.classList.add("dragging"));
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        clearDragState();
      });

      item.append(handle, info, notes, edit, add);
      elements.songLibrary.append(item);
    });
  }

  function renderCurrentSet() {
    elements.setName.value = state.draft.name;
    elements.targetMinutes.value = state.draft.targetMinutes;
    elements.setList.replaceChildren();

    const songs = state.draft.songIds.map(songById).filter(Boolean);
    const totalSeconds = songs.reduce((sum, song) => sum + song.durationSec, 0);
    const targetSeconds = Math.max(60, state.draft.targetMinutes * 60);
    const difference = targetSeconds - totalSeconds;
    const unknownCount = songs.filter(song => !song.durationSec).length;
    const ratio = totalSeconds / targetSeconds;

    elements.totalTime.textContent = formatTime(totalSeconds);
    elements.targetStatus.textContent = `z ${formatTime(targetSeconds)}`;
    elements.progressBar.style.width = `${Math.min(100, ratio * 100)}%`;
    elements.progressBar.classList.toggle("over", difference < 0);
    elements.setCount.textContent = songCountLabel(songs.length);
    elements.timeDifference.className = difference < 0 ? "over" : ratio >= .95 ? "ready" : "";
    elements.timeDifference.textContent = difference < 0
      ? `Přesahuje o ${formatTime(Math.abs(difference))}`
      : `Zbývá ${formatTime(difference)}`;
    elements.unknownDurations.textContent = unknownCount
      ? `${unknownCount} ${unknownCount === 1 ? "skladba nemá" : unknownCount < 5 ? "skladby nemají" : "skladeb nemá"} vyplněnou délku.`
      : "";
    elements.emptySet.classList.toggle("hidden", songs.length > 0);
    const transitionPlans = allTransitionPlans(songs);

    songs.forEach((song, index) => {
      const transitions = state.members.flatMap(member => {
        const changes = transitionPlans.get(member.id)?.[index]?.changes || [];
        return changes.length ? [{ member, changes }] : [];
      });
      if (transitions.length) {
        const transitionRow = document.createElement("li");
        transitionRow.className = "transition-row";
        const transitionText = document.createElement("span");
        transitions.forEach(({ member, changes }, transitionIndex) => {
          if (transitionIndex) transitionText.append(document.createTextNode(" · "));
          const memberName = document.createElement("strong");
          memberName.textContent = `${member.name}: `;
          transitionText.append(memberName, document.createTextNode(changes.join(", ")));
        });
        transitionRow.append(transitionText);
        elements.setList.append(transitionRow);
      }

      const item = document.createElement("li");
      item.className = "set-song";
      item.draggable = true;
      item.dataset.index = index;

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      handle.title = "Přetáhnout";

      const title = document.createElement("div");
      title.className = "set-song-title";
      const strong = document.createElement("strong");
      strong.textContent = song.title;
      const small = document.createElement("small");
      const noteCount = songNoteCount(song);
      small.textContent = `Pozice ${index + 1}${song.archived ? " · archivovaná" : ""}${noteCount ? ` · ${noteCount}× poznámka` : ""}`;
      title.append(strong, small);

      const duration = document.createElement("span");
      duration.className = "set-duration";
      duration.textContent = song.durationSec ? formatTime(song.durationSec) : "—:—";

      const moves = document.createElement("div");
      moves.className = "move-buttons";
      const up = createIconButton("↑", "Posunout nahoru");
      const down = createIconButton("↓", "Posunout dolů");
      up.disabled = index === 0;
      down.disabled = index === songs.length - 1;
      up.addEventListener("click", () => moveSetSong(index, index - 1));
      down.addEventListener("click", () => moveSetSong(index, index + 1));
      moves.append(up, down);

      const actions = document.createElement("div");
      actions.className = "set-actions";
      const notes = createIconButton("☷", `Poznámky členů ke skladbě ${song.title}`, `notes${noteCount ? " has-notes" : ""}`);
      if (noteCount) notes.dataset.count = noteCount;
      notes.addEventListener("click", () => openNotesDialog(song));
      const remove = createIconButton("×", `Odebrat ${song.title}`);
      remove.addEventListener("click", () => {
        state.draft.songIds.splice(index, 1);
        commit({ library: true });
      });
      actions.append(notes, remove);

      item.addEventListener("dragstart", event => {
        draggedItem = { type: "setlist", index };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
        requestAnimationFrame(() => item.classList.add("dragging"));
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        clearDragState();
      });
      item.addEventListener("dragover", event => {
        event.preventDefault();
        document.querySelectorAll(".set-song.drop-before").forEach(row => row.classList.remove("drop-before"));
        item.classList.add("drop-before");
      });
      item.addEventListener("drop", event => {
        event.preventDefault();
        handleDrop(index);
      });

      item.append(handle, title, duration, moves, actions);
      elements.setList.append(item);
    });
  }

  function renderSavedSets() {
    elements.savedSets.replaceChildren();
    const saved = [...state.savedSetlists].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    if (!saved.length) {
      const empty = document.createElement("div");
      empty.className = "empty-saved";
      empty.textContent = "Zatím tu nic není. Poskládej aktuální set, pojmenuj ho a klikni na „Uložit set“.";
      elements.savedSets.append(empty);
      return;
    }

    saved.forEach(set => {
      const songs = set.songIds.map(songById).filter(Boolean);
      const totalSeconds = songs.reduce((sum, song) => sum + song.durationSec, 0);
      const card = document.createElement("article");
      card.className = `saved-card${state.draft.savedId === set.id ? " active" : ""}`;

      const head = document.createElement("div");
      head.className = "saved-card-head";
      const nameWrap = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = set.name;
      const date = document.createElement("small");
      date.textContent = set.updatedAt ? `Uloženo ${new Date(set.updatedAt).toLocaleDateString("cs-CZ")}` : "Uložený setlist";
      nameWrap.append(title, date);
      const target = document.createElement("span");
      target.className = "count-badge";
      target.textContent = `${set.targetMinutes} min`;
      head.append(nameWrap, target);

      const time = document.createElement("div");
      time.className = "saved-card-time";
      time.textContent = formatTime(totalSeconds);
      const meta = document.createElement("div");
      meta.className = "saved-card-meta";
      meta.textContent = `${songCountLabel(songs.length)} · ${songs.filter(song => !song.durationSec).length ? "obsahuje nevyplněné časy" : "všechny časy vyplněné"}`;

      const actions = document.createElement("div");
      actions.className = "saved-card-actions";
      const load = document.createElement("button");
      load.type = "button";
      load.className = "button button-small button-primary";
      load.textContent = state.draft.savedId === set.id ? "Načtený" : "Načíst set";
      load.addEventListener("click", () => loadSavedSet(set.id));
      const duplicate = createIconButton("⧉", `Vytvořit kopii setu ${set.name}`);
      duplicate.addEventListener("click", () => duplicateSavedSet(set.id));
      const remove = createIconButton("×", `Smazat set ${set.name}`);
      remove.addEventListener("click", () => deleteSavedSet(set.id));
      actions.append(load, duplicate, remove);

      card.append(head, time, meta, actions);
      elements.savedSets.append(card);
    });
  }

  function addSongToSet(songId, index = state.draft.songIds.length) {
    if (state.draft.songIds.includes(songId)) {
      showToast("Tahle píseň už v aktuálním setu je.");
      return;
    }
    state.draft.songIds.splice(index, 0, songId);
    commit({ library: true });
  }

  function moveSetSong(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= state.draft.songIds.length || toIndex >= state.draft.songIds.length) return;
    const [songId] = state.draft.songIds.splice(fromIndex, 1);
    state.draft.songIds.splice(toIndex, 0, songId);
    commit();
  }

  function handleDrop(index) {
    if (!draggedItem) return;
    if (draggedItem.type === "library") {
      addSongToSet(draggedItem.songId, index);
    } else if (draggedItem.type === "setlist") {
      let destination = index;
      const [songId] = state.draft.songIds.splice(draggedItem.index, 1);
      if (draggedItem.index < destination) destination -= 1;
      state.draft.songIds.splice(Math.max(0, destination), 0, songId);
      commit();
    }
    clearDragState();
  }

  function clearDragState() {
    draggedItem = null;
    elements.currentSet.classList.remove("drag-active");
    elements.emptySet.classList.remove("drag-active");
    document.querySelectorAll(".drop-before, .dragging").forEach(item => item.classList.remove("drop-before", "dragging"));
  }

  function openNotesDialog(song) {
    notesEditingSongId = song.id;
    pendingMemberNotes = JSON.parse(JSON.stringify(song.memberNotes || {}));
    activeNotesMemberId = state.members[0]?.id || null;
    elements.notesSongTitle.textContent = `Poznámky · ${song.title}`;
    renderMemberTabs();
    loadActiveMemberNote();
    elements.notesDialog.showModal();
  }

  function currentNoteFromForm() {
    const member = memberById(activeNotesMemberId);
    const profile = profileForMember(member);
    const selectedInstrument = elements.noteInstrument.value;
    const effectiveInstrument = activeMemberEffectiveInstrument();
    const storesInstrument = profile.instruments.length > 1;
    return normalizeNote({
      capo: instrumentUsesCapo(member, effectiveInstrument) ? elements.noteCapo.value : "K0",
      instrument: storesInstrument ? selectedInstrument : "",
      sound: instrumentUsesSound(effectiveInstrument) ? elements.noteSound.value : "",
      text: elements.noteText.value
    });
  }

  function storeActiveMemberNote() {
    if (!activeNotesMemberId) return;
    pendingMemberNotes[activeNotesMemberId] = currentNoteFromForm();
  }

  function loadActiveMemberNote() {
    const member = memberById(activeNotesMemberId);
    const profile = profileForMember(member);
    const note = normalizeNote(pendingMemberNotes[activeNotesMemberId]);
    elements.noteInstrument.replaceChildren();
    if (profile.instruments.length > 1) {
      const unchanged = document.createElement("option");
      unchanged.value = "";
      unchanged.textContent = "Beze změny";
      elements.noteInstrument.append(unchanged);
    }
    profile.instruments.forEach(instrument => {
      const option = document.createElement("option");
      option.value = instrument;
      option.textContent = sameInstrument(instrument, profile.defaultInstrument)
        ? `${instrument} (výchozí)`
        : instrument;
      elements.noteInstrument.append(option);
    });
    const selectedInstrument = profile.instruments.find(instrument => sameInstrument(instrument, note.instrument))
      || (profile.instruments.length === 1 ? profile.defaultInstrument : "");
    elements.noteInstrument.value = selectedInstrument;
    elements.noteInstrumentField.hidden = profile.instruments.length <= 1;
    elements.noteCapo.value = note.capo;
    elements.noteSound.value = note.sound;
    elements.noteText.value = note.text;
    updateActiveMemberNoteFields();
  }

  function activeMemberEffectiveInstrument() {
    const member = memberById(activeNotesMemberId);
    const profile = profileForMember(member);
    if (elements.noteInstrument.value) return elements.noteInstrument.value;
    const songs = state.draft.songIds.map(songById).filter(Boolean);
    const songIndex = songs.findIndex(song => song.id === notesEditingSongId);
    if (songIndex >= 0) {
      return transitionPlanForMember(songs, member)[songIndex]?.instrument || profile.defaultInstrument;
    }
    return profile.defaultInstrument;
  }

  function updateActiveMemberNoteFields() {
    const member = memberById(activeNotesMemberId);
    const profile = profileForMember(member);
    const selectedInstrument = activeMemberEffectiveInstrument();
    const usesCapo = instrumentUsesCapo(member, selectedInstrument);
    const usesSound = instrumentUsesSound(selectedInstrument);
    elements.noteCapoField.hidden = !usesCapo;
    elements.noteSoundField.hidden = !usesSound;
    if (!usesCapo) elements.noteCapo.value = "K0";
    if (!usesSound) elements.noteSound.value = "";
    if (!profile.capoInstruments.length && profile.instruments.length === 1) {
      elements.noteTransitionHelp.textContent = member?.name === "Jáchym"
        ? "Pro Jáchyma sem stačí zapsat pokyn ke skladbě, například kdy klepe náklep."
        : `Nástroj ${profile.defaultInstrument} je nastavený napevno; stačí doplnit vlastní pokyn.`;
    } else {
      elements.noteTransitionHelp.textContent = "Aplikace hlídá poslední kapo každého nástroje a potřebnou změnu automaticky vloží mezi skladby.";
    }
  }

  function renderMemberTabs() {
    elements.memberTabs.replaceChildren();
    state.members.forEach(member => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `member-tab${member.id === activeNotesMemberId ? " active" : ""}${noteHasContent(pendingMemberNotes[member.id]) ? " has-note" : ""}`;
      tab.textContent = member.name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(member.id === activeNotesMemberId));
      tab.addEventListener("click", () => {
        storeActiveMemberNote();
        activeNotesMemberId = member.id;
        renderMemberTabs();
        loadActiveMemberNote();
      });
      elements.memberTabs.append(tab);
    });
  }

  function saveMemberNotes() {
    const song = songById(notesEditingSongId);
    if (!song) return;
    storeActiveMemberNote();
    song.memberNotes = Object.fromEntries(
      Object.entries(pendingMemberNotes)
        .map(([memberId, note]) => [memberId, normalizeNote(note)])
        .filter(([, note]) => noteHasContent(note))
    );
    commit({ library: true, saved: true });
    elements.notesDialog.close();
    showToast(`Individuální poznámky ke skladbě „${song.title}“ jsou uložené.`);
  }

  function openMembersDialog() {
    membersDraft = state.members.map(member => ({ ...member, instruments: [...member.instruments] }));
    elements.membersError.textContent = "";
    renderMemberRows();
    elements.membersDialog.showModal();
  }

  function syncMemberDraftFromInputs() {
    elements.memberRows.querySelectorAll("input[data-member-id]").forEach(input => {
      const member = membersDraft.find(candidate => candidate.id === input.dataset.memberId);
      if (member) member.name = input.value;
    });
  }

  function renderMemberRows() {
    elements.memberRows.replaceChildren();
    membersDraft.forEach((member, index) => {
      const row = document.createElement("div");
      row.className = "member-row";
      const number = document.createElement("span");
      number.className = "member-number";
      number.textContent = index + 1;
      const content = document.createElement("div");
      content.className = "member-row-content";
      const nameLabel = document.createElement("label");
      nameLabel.className = "field";
      const nameCaption = document.createElement("span");
      nameCaption.textContent = "Jméno";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 60;
      input.required = true;
      input.value = member.name;
      input.dataset.memberId = member.id;
      input.setAttribute("aria-label", `Jméno člena ${index + 1}`);
      nameLabel.append(nameCaption, input);

      const instrumentsWrap = document.createElement("div");
      instrumentsWrap.className = "member-instruments";
      const instrumentsTitle = document.createElement("span");
      instrumentsTitle.className = "member-instruments-title";
      instrumentsTitle.textContent = "Nástroje · označ výchozí";
      const instrumentList = document.createElement("div");
      instrumentList.className = "member-instrument-list";
      member.instruments.forEach(instrument => {
        const instrumentRow = document.createElement("div");
        instrumentRow.className = "member-instrument";
        const defaultLabel = document.createElement("label");
        const defaultRadio = document.createElement("input");
        defaultRadio.type = "radio";
        defaultRadio.name = `default-instrument-${member.id}`;
        defaultRadio.checked = sameInstrument(instrument, member.defaultInstrument);
        defaultRadio.setAttribute("aria-label", `Nastavit ${instrument} jako výchozí nástroj pro ${member.name || `člena ${index + 1}`}`);
        defaultRadio.addEventListener("change", () => {
          member.defaultInstrument = instrument;
        });
        const instrumentName = document.createElement("span");
        instrumentName.textContent = instrument;
        defaultLabel.append(defaultRadio, instrumentName);
        instrumentRow.append(defaultLabel);
        if (member.instruments.length > 1) {
          const remove = createIconButton("×", `Odebrat nástroj ${instrument}`);
          remove.addEventListener("click", () => {
            syncMemberDraftFromInputs();
            member.instruments = member.instruments.filter(candidate => !sameInstrument(candidate, instrument));
            if (sameInstrument(member.defaultInstrument, instrument)) member.defaultInstrument = member.instruments[0];
            renderMemberRows();
          });
          instrumentRow.append(remove);
        }
        instrumentList.append(instrumentRow);
      });

      const addInstrument = document.createElement("div");
      addInstrument.className = "member-instrument-add";
      const newInstrument = document.createElement("input");
      newInstrument.type = "text";
      newInstrument.maxLength = 80;
      newInstrument.placeholder = "Další nástroj…";
      newInstrument.setAttribute("aria-label", `Další nástroj pro ${member.name || `člena ${index + 1}`}`);
      const add = createIconButton("+", `Přidat nástroj pro ${member.name || `člena ${index + 1}`}`);
      const addInstrumentToMember = () => {
        const instrument = newInstrument.value.trim();
        if (!instrument) return;
        if (member.instruments.some(candidate => sameInstrument(candidate, instrument))) {
          elements.membersError.textContent = `Nástroj „${instrument}“ už ${member.name || "tento člen"} má.`;
          return;
        }
        syncMemberDraftFromInputs();
        member.instruments.push(instrument);
        elements.membersError.textContent = "";
        renderMemberRows();
      };
      add.addEventListener("click", addInstrumentToMember);
      newInstrument.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          addInstrumentToMember();
        }
      });
      addInstrument.append(newInstrument, add);
      instrumentsWrap.append(instrumentsTitle, instrumentList, addInstrument);
      content.append(nameLabel, instrumentsWrap);
      row.append(number, content);
      elements.memberRows.append(row);
    });
  }

  function addMemberRow() {
    syncMemberDraftFromInputs();
    const member = { id: makeId("member"), name: "", instruments: ["Zpěv"], defaultInstrument: "Zpěv" };
    membersDraft.push(member);
    renderMemberRows();
    elements.memberRows.querySelector(`input[data-member-id="${member.id}"]`)?.focus();
  }

  function saveMembers() {
    syncMemberDraftFromInputs();
    const cleaned = membersDraft.map(member => ({
      ...member,
      name: member.name.trim(),
      instruments: [...new Set(member.instruments.map(instrument => instrument.trim()).filter(Boolean))]
    })).map(member => ({
      ...member,
      defaultInstrument: member.instruments.find(instrument => sameInstrument(instrument, member.defaultInstrument)) || member.instruments[0]
    }));
    if (cleaned.some(member => !member.name)) {
      elements.membersError.textContent = "Každý člen musí mít vyplněné jméno.";
      return false;
    }
    const normalizedNames = cleaned.map(member => member.name.toLocaleLowerCase("cs"));
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      elements.membersError.textContent = "Každý člen musí mít unikátní jméno.";
      return false;
    }
    if (cleaned.some(member => !member.instruments.length)) {
      elements.membersError.textContent = "Každý člen musí mít alespoň jeden nástroj.";
      return false;
    }
    state.members = cleaned;
    commit({ library: true, saved: true });
    elements.membersDialog.close();
    showToast("Seznam členů kapely je uložený.");
    return true;
  }

  function openExportDialog() {
    if (!state.draft.songIds.length) {
      showToast("Do setlistu nejdřív přidej alespoň jednu píseň.");
      return;
    }
    elements.exportError.textContent = "";
    const individualRadio = elements.exportForm.querySelector('input[name="exportMode"][value="individual"]');
    individualRadio.checked = true;
    exportCleanCopiesEdited = false;
    renderExportMembers();
    updateExportMode(true);
    elements.exportDialog.showModal();
  }

  function renderExportMembers() {
    elements.exportMemberList.replaceChildren();
    state.members.forEach(member => {
      const label = document.createElement("label");
      label.className = "export-member-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = member.id;
      checkbox.checked = true;
      checkbox.name = "exportMember";
      checkbox.setAttribute("aria-label", `Vlastní poznámky pro ${member.name}`);
      const copy = document.createElement("span");
      copy.className = "export-member-copy";
      const name = document.createElement("strong");
      name.textContent = member.name;
      const status = document.createElement("small");
      const updateStatus = () => {
        status.textContent = checkbox.checked ? "individuální stránka" : "čistá kopie";
        syncSuggestedCleanCopies();
      };
      checkbox.addEventListener("change", updateStatus);
      updateStatus();
      copy.append(name, status);
      label.append(checkbox, copy);
      elements.exportMemberList.append(label);
    });
  }

  function suggestedCleanCopyCount() {
    const mode = elements.exportForm.querySelector('input[name="exportMode"]:checked')?.value;
    if (mode === "common") return 6;
    const selectedCount = elements.exportMemberList.querySelectorAll('input[name="exportMember"]:checked').length;
    return Math.max(0, state.members.length - selectedCount);
  }

  function syncSuggestedCleanCopies(force = false) {
    if (force || !exportCleanCopiesEdited) elements.cleanCopyCount.value = suggestedCleanCopyCount();
  }

  function updateExportMode(resetCleanCopies = false) {
    const mode = elements.exportForm.querySelector('input[name="exportMode"]:checked')?.value;
    elements.exportMembersFieldset.disabled = mode !== "individual";
    if (resetCleanCopies) exportCleanCopiesEdited = false;
    syncSuggestedCleanCopies(resetCleanCopies);
  }

  function appendPrintNote(container, label, value, chip = true) {
    if (!value) return;
    const note = document.createElement("span");
    note.className = chip ? "print-note-chip" : "";
    note.textContent = label ? `${label}: ${value}` : value;
    container.append(note);
  }

  function buildPrintPage(member = null, includeNotes = true) {
    const songs = state.draft.songIds.map(songById).filter(Boolean);
    const transitionPlan = member && includeNotes ? transitionPlanForMember(songs, member) : [];
    const page = document.createElement("section");
    page.className = "print-page";

    const header = document.createElement("header");
    header.className = "print-header";
    const memberWrap = document.createElement("div");
    memberWrap.className = "print-member";
    const memberName = document.createElement("strong");
    memberName.textContent = member?.name || "Čistý setlist";
    memberWrap.append(memberName);
    header.append(memberWrap);

    const list = document.createElement("ol");
    list.className = "print-list";
    songs.forEach((song, index) => {
      if (member && includeNotes && index > 0) {
        const changes = transitionPlan[index]?.changes || [];
        if (changes.length) {
          const transition = document.createElement("li");
          transition.className = "print-transition";
          transition.textContent = changes.join(" · ");
          list.append(transition);
        }
      }

      const row = document.createElement("li");
      row.className = "print-song";
      const songTitle = document.createElement("span");
      songTitle.className = "print-song-title";
      songTitle.textContent = song.title;
      row.append(songTitle);

      if (member && includeNotes) {
        const note = normalizeNote(song.memberNotes?.[member.id]);
        if (noteHasContent(note)) {
          const notes = document.createElement("div");
          notes.className = "print-notes";
          const instrument = transitionPlan[index]?.instrument || note.instrument;
          if (instrumentUsesCapo(member, instrument)) appendPrintNote(notes, "", note.capo);
          if (profileForMember(member).instruments.length > 1) appendPrintNote(notes, "", instrument);
          if (instrumentUsesSound(instrument)) appendPrintNote(notes, "Zvuk", note.sound);
          appendPrintNote(notes, "", note.text, false);
          if (notes.childElementCount) row.append(notes);
        }
      }
      list.append(row);
    });

    page.append(header, list);
    return page;
  }

  function preparePrintPages() {
    const mode = elements.exportForm.querySelector('input[name="exportMode"]:checked')?.value || "individual";
    const selectedIds = new Set([...elements.exportMemberList.querySelectorAll('input[name="exportMember"]:checked')]
      .map(input => input.value));
    const cleanCopyCount = Math.max(0, Math.min(50, Math.floor(Number(elements.cleanCopyCount.value) || 0)));
    elements.cleanCopyCount.value = cleanCopyCount;
    elements.printArea.replaceChildren();
    if (mode === "individual") {
      state.members
        .filter(member => selectedIds.has(member.id))
        .forEach(member => elements.printArea.append(buildPrintPage(member, true)));
    }
    for (let index = 0; index < cleanCopyCount; index += 1) elements.printArea.append(buildPrintPage());
    if (!elements.printArea.childElementCount) {
      elements.exportError.textContent = "Vyber alespoň jednu individuální stránku nebo nastav počet čistých kopií.";
      return false;
    }
    elements.exportError.textContent = "";
    return true;
  }

  function printSetlists() {
    if (!preparePrintPages()) return;
    elements.exportDialog.close();
    window.print();
  }

  function safeFileName(value) {
    return String(value || "setlist")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLocaleLowerCase() || "setlist";
  }

  function standalonePrintStyles() {
    return `
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #e9e9e9; font-family: Arial, sans-serif; }
      .screen-bar { position: sticky; z-index: 5; top: 0; display: flex; justify-content: center; gap: 10px; padding: 12px; background: #171512; box-shadow: 0 3px 18px #0005; }
      .screen-bar button { border: 0; border-radius: 9px; padding: 10px 16px; color: #241708; background: #ffb23f; font: 700 14px Arial, sans-serif; cursor: pointer; }
      .print-page { position: relative; display: flex; flex-direction: column; width: 210mm; min-height: 297mm; margin: 14px auto; padding: 8mm 10mm; color: #111; background: #fff; box-shadow: 0 10px 35px #0002; break-after: page; page-break-after: always; }
      .print-page:last-child { break-after: auto; page-break-after: auto; }
      .print-header { position: absolute; top: 8mm; right: 10mm; left: 10mm; margin: 0; text-align: center; }
      .print-member strong { display: inline-block; border: 1px solid #bbb; border-radius: 999px; padding: 3px 8px; color: #555; font-size: 9pt; font-weight: 800; line-height: 1; letter-spacing: .14em; text-transform: uppercase; }
      .print-list { width: 100%; margin: auto 0; padding: 16mm 0; list-style: none; counter-reset: print-order; }
      .print-song { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #ccc; counter-increment: print-order; break-inside: avoid; }
      .print-song::before { content: counter(print-order, decimal-leading-zero); color: #666; font-size: 11pt; text-align: left; }
      .print-song-title { font-size: 20pt; font-weight: 900; line-height: 1.08; text-align: center; }
      .print-notes { grid-column: 1 / -1; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 9px; color: #222; font-size: 10.5pt; text-align: center; }
      .print-note-chip { border-radius: 4px; padding: 2px 6px; background: #eee; font-weight: 800; }
      .print-transition { padding: 5px 12px; color: #8b4e00; font-size: 10.5pt; font-weight: 800; text-align: center; break-inside: avoid; }
      .print-transition::before { content: "↻ "; }
      @page { size: A4 portrait; margin: 0; }
      @media print {
        body { background: #fff; }
        .screen-bar { display: none; }
        .print-page { margin: 0; box-shadow: none; }
      }
      @media screen and (max-width: 800px) {
        .print-page { width: 100%; min-height: 0; margin: 0; padding: 18px; }
      }
    `;
  }

  function downloadPrintableSetlists() {
    if (!preparePrintPages()) return;
    const pages = elements.printArea.innerHTML;
    const title = state.draft.name.trim() || "Aktuální setlist";
    const documentHtml = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>
  <style>${standalonePrintStyles()}</style>
</head>
<body>
  <div class="screen-bar"><button type="button" onclick="window.print()">Tisk / uložit jako PDF</button></div>
  ${pages}
</body>
</html>`;
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(title)}-tisk.html`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.exportDialog.close();
    showToast("Tisková sestava byla stažena. Otevři ji a zvol Tisk / uložit jako PDF.");
  }

  function openSongDialog(song = null) {
    editingSongId = song?.id ?? null;
    elements.songDialogTitle.textContent = song ? "Upravit píseň" : "Přidat píseň";
    elements.songTitle.value = song?.title ?? "";
    elements.songAlbum.value = song?.album ?? "";
    elements.songMinutes.value = song ? Math.floor(song.durationSec / 60) : 3;
    elements.songSeconds.value = song ? song.durationSec % 60 : 30;
    elements.archiveSong.hidden = !song;
    elements.archiveSong.textContent = song?.archived ? "Obnovit píseň" : "Archivovat píseň";
    elements.archiveSong.classList.toggle("button-danger", !song?.archived);
    elements.archiveSong.classList.toggle("button-ghost", Boolean(song?.archived));
    elements.songError.textContent = "";
    elements.songDialog.showModal();
    requestAnimationFrame(() => elements.songTitle.focus());
  }

  function saveSongFromDialog() {
    const title = elements.songTitle.value.trim();
    const album = elements.songAlbum.value.trim();
    const minutes = Number(elements.songMinutes.value);
    const seconds = Number(elements.songSeconds.value);
    if (!title) {
      elements.songError.textContent = "Doplň název písně.";
      return false;
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59 || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
      elements.songError.textContent = "Čas musí být v rozsahu 0:00 až 59:59.";
      return false;
    }
    const duplicate = state.songs.some(song => song.id !== editingSongId && song.title.localeCompare(title, "cs", { sensitivity: "base" }) === 0);
    if (duplicate) {
      elements.songError.textContent = "Píseň s tímto názvem už v knihovně je.";
      return false;
    }
    const durationSec = minutes * 60 + seconds;
    if (editingSongId) {
      const song = songById(editingSongId);
      if (song) Object.assign(song, { title, durationSec, album });
      showToast("Píseň byla upravena.");
    } else {
      state.songs.push({ id: makeId("song"), title, durationSec, album, archived: false, memberNotes: {} });
      showToast("Píseň byla přidána do knihovny.");
    }
    commit({ library: true, saved: true });
    return true;
  }

  function toggleSongArchive() {
    const song = songById(editingSongId);
    if (!song) return;
    song.archived = !song.archived;
    commit({ library: true, saved: true });
    elements.songDialog.close();
    showToast(song.archived ? `Píseň „${song.title}“ byla archivována.` : `Píseň „${song.title}“ je znovu aktivní.`);
  }

  function saveCurrentSet() {
    const name = state.draft.name.trim();
    if (!name) {
      elements.setName.focus();
      showToast("Nejdřív setlist pojmenuj.");
      return;
    }
    if (!state.draft.songIds.length) {
      showToast("Do setlistu nejdřív přidej alespoň jednu píseň.");
      return;
    }

    const now = new Date().toISOString();
    let saved = state.savedSetlists.find(set => set.id === state.draft.savedId);
    if (!saved) {
      saved = { id: makeId("set"), createdAt: now };
      state.savedSetlists.push(saved);
      state.draft.savedId = saved.id;
    }
    Object.assign(saved, {
      name,
      targetMinutes: state.draft.targetMinutes,
      songIds: [...state.draft.songIds],
      updatedAt: now
    });
    commit({ saved: true });
    showToast(`Set „${name}“ je uložený.`);
  }

  function startNewSet() {
    if (state.draft.songIds.length && !confirm("Začít nový set? Aktuální rozpracovaná podoba zůstane jen tehdy, pokud jsi ji uložil.")) return;
    state.draft = { savedId: null, name: "", targetMinutes: 45, songIds: [] };
    commit({ library: true, saved: true });
    elements.setName.focus();
  }

  function loadSavedSet(id) {
    const saved = state.savedSetlists.find(set => set.id === id);
    if (!saved) return;
    state.draft = {
      savedId: saved.id,
      name: saved.name,
      targetMinutes: saved.targetMinutes,
      songIds: [...saved.songIds]
    };
    commit({ library: true, saved: true });
    window.scrollTo({ top: elements.setName.getBoundingClientRect().top + window.scrollY - 18, behavior: "smooth" });
    showToast(`Načten set „${saved.name}“.`);
  }

  function duplicateSavedSet(id) {
    const saved = state.savedSetlists.find(set => set.id === id);
    if (!saved) return;
    const copyName = `${saved.name} — kopie`;
    state.draft = {
      savedId: null,
      name: copyName,
      targetMinutes: saved.targetMinutes,
      songIds: [...saved.songIds]
    };
    commit({ library: true, saved: true });
    showToast("Kopie je připravená. Ulož ji jako nový set.");
  }

  function deleteSavedSet(id) {
    const saved = state.savedSetlists.find(set => set.id === id);
    if (!saved || !confirm(`Opravdu smazat uložený set „${saved.name}“?`)) return;
    state.savedSetlists = state.savedSetlists.filter(set => set.id !== id);
    if (state.draft.savedId === id) state.draft.savedId = null;
    commit({ saved: true });
    showToast("Uložený set byl smazán.");
  }

  function parseBulkSongs(text) {
    const result = [];
    const errors = [];
    text.split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const [rawTitle, rawDuration = "", rawAlbum = ""] = trimmed.split("|").map(part => part.trim());
      if (!rawTitle) {
        errors.push(`Řádek ${index + 1}: chybí název.`);
        return;
      }
      let durationSec = 0;
      if (rawDuration) {
        const match = rawDuration.match(/^(\d{1,2}):(\d{2})$/);
        if (!match || Number(match[2]) > 59) {
          errors.push(`Řádek ${index + 1}: čas musí vypadat například 3:45.`);
          return;
        }
        durationSec = Number(match[1]) * 60 + Number(match[2]);
      }
      result.push({ title: rawTitle, durationSec, album: rawAlbum, archived: false });
    });
    return { result, errors };
  }

  function normalizeSpreadsheetHeader(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("cs-CZ");
  }

  function parseSpreadsheetDuration(value, formattedValue = "") {
    if (value === null || value === undefined || value === "") return 0;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value < 0) throw new Error("délka nesmí být záporná");
      if (value > 0 && value < 1) return Math.round(value * 86400);
      return Math.round(value * 60);
    }
    const text = String(value || formattedValue).trim();
    if (!text) return 0;
    if (/^\d+(?:[.,]\d+)?$/.test(text)) return Math.round(Number(text.replace(",", ".")) * 60);
    const parts = text.split(":").map(part => Number(part));
    if (parts.some(part => !Number.isInteger(part) || part < 0)) throw new Error("čas musí vypadat například 3:45");
    if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    throw new Error("čas musí vypadat například 3:45");
  }

  async function importRepertoireSpreadsheet(file) {
    try {
      if (!window.XLSX) throw new Error("Knihovna pro XLSX není dostupná.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Soubor je příliš velký. Maximum je 10 MB.");
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames.includes("Repertoár") ? "Repertoár" : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error("V souboru není žádný list.");
      const rawRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
      const displayRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      if (!rawRows.length) throw new Error("Soubor je prázdný.");

      const headers = rawRows[0].map(normalizeSpreadsheetHeader);
      const titleIndex = headers.indexOf("nazev pisnicky");
      const albumIndex = headers.indexOf("nazev alba");
      const durationIndex = headers.indexOf("delka pisnicky");
      if ([titleIndex, albumIndex, durationIndex].some(index => index < 0)) {
        throw new Error("Chybí hlavičky Název písničky, Název alba nebo Délka písničky.");
      }

      const candidates = [];
      for (let index = 1; index < rawRows.length; index += 1) {
        const row = rawRows[index] || [];
        const title = String(row[titleIndex] || "").trim();
        const album = String(row[albumIndex] || "").trim();
        const rawDuration = row[durationIndex];
        const displayDuration = displayRows[index]?.[durationIndex] || "";
        if (!title && !album && !rawDuration && !displayDuration) continue;
        if (!title) throw new Error(`Řádek ${index + 1}: chybí název písničky.`);
        let durationSec;
        try {
          durationSec = parseSpreadsheetDuration(rawDuration, displayDuration);
        } catch (error) {
          throw new Error(`Řádek ${index + 1}: ${error.message}`);
        }
        candidates.push({ title, album, durationSec, archived: false });
      }
      if (!candidates.length) throw new Error("V šabloně nejsou žádné písničky.");

      const knownTitles = new Set(state.songs.map(song => song.title.toLocaleLowerCase("cs-CZ")));
      let added = 0;
      let skipped = 0;
      candidates.forEach(candidate => {
        const key = candidate.title.toLocaleLowerCase("cs-CZ");
        if (knownTitles.has(key)) {
          skipped += 1;
          return;
        }
        knownTitles.add(key);
        state.songs.push({ id: makeId("song"), memberNotes: {}, ...candidate });
        added += 1;
      });
      commit({ library: true });
      const skippedText = skipped ? `, ${skipped} přeskočeno jako duplicita` : "";
      showToast(`Import dokončen: ${added} přidáno${skippedText}.`);
    } catch (error) {
      showToast(`Import se nepodařil: ${error.message}`);
    } finally {
      elements.bulkImportFile.value = "";
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `setlister-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Záloha byla stažena.");
  }

  async function importData(file) {
    try {
      const imported = JSON.parse(await file.text());
      if (!isValidState(imported)) throw new Error("Neplatný formát");
      if (!confirm("Import nahradí všechna aktuální lokální data. Pokračovat?")) return;
      state = normalizeState(imported);
      saveState();
      renderAll();
      showToast("Data byla úspěšně importována.");
    } catch (error) {
      showToast("Soubor není platná záloha Setlisteru.");
    } finally {
      elements.importData.value = "";
    }
  }

  function renderAll() {
    renderLibrary();
    renderCurrentSet();
    renderSavedSets();
  }

  elements.songSearch.addEventListener("input", renderLibrary);
  elements.albumFilter.addEventListener("change", renderLibrary);
  elements.showArchived.addEventListener("change", renderLibrary);
  elements.addSong.addEventListener("click", () => openSongDialog());
  elements.bulkAdd.addEventListener("click", () => {
    elements.bulkSongs.value = "";
    elements.bulkError.textContent = "";
    elements.bulkDialog.showModal();
    requestAnimationFrame(() => elements.bulkSongs.focus());
  });
  elements.bulkImport.addEventListener("click", () => elements.bulkImportFile.click());
  elements.bulkImportFile.addEventListener("change", event => {
    const [file] = event.target.files;
    if (file) importRepertoireSpreadsheet(file);
  });
  elements.setName.addEventListener("input", event => {
    state.draft.name = event.target.value;
    saveState();
  });
  elements.targetMinutes.addEventListener("input", event => {
    state.draft.targetMinutes = Math.max(1, Math.min(600, Number(event.target.value) || 45));
    saveState();
    renderCurrentSet();
  });
  elements.saveSet.addEventListener("click", saveCurrentSet);
  elements.newSet.addEventListener("click", startNewSet);
  elements.manageMembers.addEventListener("click", openMembersDialog);
  elements.exportSet.addEventListener("click", openExportDialog);
  elements.clearSet.addEventListener("click", () => {
    if (!state.draft.songIds.length || confirm("Opravdu vyprázdnit aktuální set?")) {
      state.draft.songIds = [];
      commit({ library: true });
    }
  });
  elements.exportData.addEventListener("click", exportData);
  elements.importData.addEventListener("change", event => {
    const [file] = event.target.files;
    if (file) importData(file);
  });

  elements.currentSet.addEventListener("dragover", event => {
    event.preventDefault();
    elements.currentSet.classList.add("drag-active");
    if (!state.draft.songIds.length) elements.emptySet.classList.add("drag-active");
  });
  elements.currentSet.addEventListener("dragleave", event => {
    if (!elements.currentSet.contains(event.relatedTarget)) elements.currentSet.classList.remove("drag-active");
  });
  elements.currentSet.addEventListener("drop", event => {
    if (event.target.closest(".set-song")) return;
    event.preventDefault();
    if (draggedItem?.type === "library") addSongToSet(draggedItem.songId);
    if (draggedItem?.type === "setlist") {
      const [songId] = state.draft.songIds.splice(draggedItem.index, 1);
      state.draft.songIds.push(songId);
      commit();
    }
    clearDragState();
  });

  elements.songForm.addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    if (event.submitter?.value === "archive") {
      event.preventDefault();
      toggleSongArchive();
      return;
    }
    event.preventDefault();
    if (saveSongFromDialog()) elements.songDialog.close();
  });

  elements.notesForm.addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    saveMemberNotes();
  });
  elements.noteInstrument.addEventListener("change", updateActiveMemberNoteFields);

  elements.addMember.addEventListener("click", addMemberRow);
  elements.membersForm.addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    saveMembers();
  });

  elements.exportForm.addEventListener("change", event => {
    if (event.target.name === "exportMode") updateExportMode(true);
  });
  elements.cleanCopyCount.addEventListener("input", () => {
    exportCleanCopiesEdited = true;
  });
  elements.downloadPrintFile.addEventListener("click", downloadPrintableSetlists);
  elements.exportForm.addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    printSetlists();
  });

  elements.bulkForm.addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const { result, errors } = parseBulkSongs(elements.bulkSongs.value);
    if (errors.length) {
      elements.bulkError.textContent = errors[0];
      return;
    }
    if (!result.length) {
      elements.bulkError.textContent = "Vlož alespoň jednu píseň.";
      return;
    }
    let added = 0;
    result.forEach(candidate => {
      const exists = state.songs.some(song => song.title.localeCompare(candidate.title, "cs", { sensitivity: "base" }) === 0);
      if (!exists) {
        state.songs.push({ id: makeId("song"), memberNotes: {}, ...candidate });
        added += 1;
      }
    });
    commit({ library: true });
    elements.bulkDialog.close();
    showToast(`Přidáno ${added} ${added === 1 ? "nová píseň" : added < 5 ? "nové písně" : "nových písní"}.`);
  });

  renderAll();
  initializeSharedState();
})();
