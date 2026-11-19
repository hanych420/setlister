(() => {
  "use strict";
  const API = "/api/app";
  const ACTIVE_BAND_KEY = "setlister-active-band";
  const ROLE_LABELS = { standard: "Běžná", opener: "Otevírací", encore: "Přídavková", closer: "Závěrečná" };
  const INSTRUMENTS = [
    { id: "none", name: "Bez nástroje", kind: "none" },
    { id: "acoustic-guitar", name: "Akustická kytara", kind: "guitar" },
    { id: "electric-guitar", name: "Elektrická kytara", kind: "electric-guitar" },
    { id: "bass", name: "Baskytara", kind: "bass" },
    { id: "drums", name: "Bicí", kind: "drums" },
    { id: "keys", name: "Klávesy", kind: "keys" },
    { id: "violin", name: "Housle", kind: "strings" },
    { id: "saxophone", name: "Saxofon", kind: "wind" },
    { id: "percussion", name: "Perkuse", kind: "percussion" }
  ];
  const elements = Object.fromEntries(Array.from(document.querySelectorAll("[id]")).map(item => [item.id, item]));
  let session = null;
  let activeBandId = localStorage.getItem(ACTIVE_BAND_KEY) || "";
  let workspace = null;
  let revision = 0;
  let saveTimer = null;
  let toastTimer = null;
  let memberDraftCustomInstruments = [];
  let memberDraftSelectedIds = new Set();
  let logoCropState = null;
  let songPrintFieldDraft = [];
  let notesPrintFieldDraft = [];
  let eventPlayedSongDraft = [];
  let eventCalendarCursor = null;
  let bandCalendarDate = new Date();
  let calendarFeedBand = "";
  let rehearsalPlanShown = false;
  let smartOrderDraft = [];
  let liveSongIds = [];
  let liveSongIndex = 0;
  let liveSwipeStart = null;
  let liveAudioContext = null;
  let liveSession = { status: "stopped", bpm: 120, startedAtMs: 0, leaderName: "" };
  let liveSessionRevision = 0;
  let liveServerOffset = 0;
  let liveBestRtt = Infinity;
  let liveLastScheduledBeat = -1;
  let livePollTimer = null;
  let liveSchedulerTimer = null;
  let liveWakeLock = null;
  let mailAgentStatus = null;
  let mailAgentPollTimer = null;
  let mailAgentWaiting = false;
  let mailConversation = [];
  let mailConversationBandId = "";
  let mailSetupInitialized = false;
  let mailSetupWasReady = false;

  async function api(path, options = {}) {
    const response = await fetch(API + path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Požadavek se nepodařil.");
    return payload;
  }
  const uid = prefix => prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const formPayload = form => Object.fromEntries(new FormData(form).entries());
  const instrumentById = id => INSTRUMENTS.find(item => item.id === id);
  const memberById = id => workspace?.state.members.find(member => member.id === id);
  const accountById = id => workspace?.members.find(account => account.id === id);
  function memberInstrument(member, id) {
    return (member?.instruments || []).find(item => item.id === id) || instrumentById(id) || { id: id || "none", name: "Bez nástroje", kind: "none" };
  }
  function signedInMemberId() {
    return workspace?.state.members.find(member => member.linkedUserId === session?.user?.id)?.id || "";
  }
  function closeCustomSelects(except = null) {
    document.querySelectorAll(".custom-select.open").forEach(node => { if (node !== except) { node.classList.remove("open"); node.querySelector("[role=combobox]")?.setAttribute("aria-expanded", "false"); } });
  }
  function enhanceSelect(select) {
    if (!select) return;
    const old = select.parentElement?.querySelector(`.custom-select[data-for="${select.id || select.name}"]`); if (old) old.remove();
    select.classList.add("select-source"); select.setAttribute("aria-hidden", "true"); select.tabIndex = -1; const root = document.createElement("div"); root.className = "custom-select"; root.dataset.for = select.id || select.name || uid("select");
    const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "custom-select-trigger"; trigger.setAttribute("role", "combobox"); trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-label", select.getAttribute("aria-label") || select.closest("label")?.childNodes[0]?.textContent.trim() || select.name || "Výběr");
    const value = document.createElement("span"); const arrow = document.createElement("i"); trigger.append(value, arrow);
    const menu = document.createElement("div"); menu.className = "custom-select-menu"; menu.setAttribute("role", "listbox");
    Array.from(select.options).forEach(source => {
      const item = document.createElement("button"); item.type = "button"; item.className = "custom-select-option"; item.dataset.value = source.value; item.textContent = source.textContent; item.setAttribute("role", "option"); item.classList.toggle("selected", source.value === select.value); item.setAttribute("aria-selected", String(source.value === select.value));
      item.addEventListener("click", event => { event.stopPropagation(); select.value = source.value; select.dispatchEvent(new Event("change", { bubbles: true })); root.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); }); menu.append(item);
    });
    const sync = () => { value.textContent = select.selectedOptions[0]?.textContent || "Vyber"; menu.querySelectorAll(".custom-select-option").forEach(item => { const selected = item.dataset.value === select.value; item.classList.toggle("selected", selected); item.setAttribute("aria-selected", String(selected)); }); };
    trigger.addEventListener("click", event => {
      event.stopPropagation();
      const opening = !root.classList.contains("open");
      closeCustomSelects(root);
      root.classList.toggle("open", opening);
      trigger.setAttribute("aria-expanded", String(opening));
      const readinessList = root.closest(".rehearsal-readiness .rehearsal-rows");
      if (opening && readinessList) {
        const bottom = menu.getBoundingClientRect().bottom - readinessList.getBoundingClientRect().bottom;
        if (bottom > 0) readinessList.scrollTop += bottom + 4;
      }
    });
    trigger.addEventListener("keydown", event => { if (event.key === "Escape") { root.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); } });
    if (select._setlisterSelectSync) select.removeEventListener("change", select._setlisterSelectSync); select._setlisterSelectSync = sync; select.addEventListener("change", sync); root.append(trigger, menu); select.insertAdjacentElement("afterend", root); sync();
  }
  function enhanceSelects(root = document) { root.querySelectorAll("select").forEach(enhanceSelect); }
  function formatTime(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
  }
  function parseDuration(value) {
    const text = String(value || "").trim();
    if (/^\d+$/.test(text)) return Number(text);
    const match = text.match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return 0;
    return Number(match[1]) * 60 + Number(match[2]);
  }
  function parsePrintTags(value) {
    const source = Array.isArray(value) ? value : String(value || "").split(/[,;|\n]/);
    return [...new Set(source.map(item => String(item).trim().slice(0, 32)).filter(Boolean))].slice(0, 8);
  }
  function normalizePrintFields(value, legacyTags = []) {
    const source = Array.isArray(value) ? value : [];
    const fields = source.filter(item => item && typeof item === "object").map(item => ({ id: String(item.id || uid("field")), label: String(item.label || "").trim().slice(0, 32), value: String(item.value || "").trim().slice(0, 64) }));
    parsePrintTags(legacyTags).forEach(tag => fields.push({ id: uid("field"), label: "", value: tag }));
    const seen = new Set(); return fields.filter(field => { const key = normalizedText(field.label) + "|" + normalizedText(field.value); if (!field.label && !field.value || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
  }
  function printFieldTexts(fields) { return normalizePrintFields(fields).map(field => field.value ? (field.label ? field.label + ": " + field.value : field.value) : "").filter(Boolean); }
  function normalizedText(value) { return String(value || "").trim().toLocaleLowerCase("cs").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function parseClock(value) { const text = String(value || "").trim(); return /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(text) ? text.padStart(5, "0") : ""; }
  const { setlistEntries, updateSetlistEntries, usesCapo } = SetlisterPlanning;
  const parseEventDate = SetlisterPlanning.parseDate;
  function formatEventDate(value, long = false) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "Datum neuvedeno"; const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("cs-CZ", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(year, month - 1, day)); }
  function showStatus(node, message, success = false) { node.textContent = message || ""; node.classList.toggle("success", success); }
  function showToast(message) {
    clearTimeout(toastTimer); elements.appToast.textContent = message; elements.appToast.classList.add("visible");
    toastTimer = setTimeout(() => elements.appToast.classList.remove("visible"), 2800);
  }
  function setScreen(name) {
    elements.authView.hidden = name !== "auth"; elements.onboardingView.hidden = name !== "onboarding"; elements.workspaceView.hidden = name !== "workspace";
    elements.userArea.hidden = name === "auth"; elements.headerBand.hidden = name !== "workspace"; elements.marketingLink.hidden = name === "workspace";
  }
  function activateAuthTab(tab) {
    document.querySelectorAll("[data-auth-tab]").forEach(button => button.classList.toggle("active", button.dataset.authTab === tab));
    elements.registerForm.hidden = tab !== "register"; elements.loginForm.hidden = tab !== "login"; showStatus(elements.authStatus, "");
  }
  function normalizeState(raw) {
    const state = raw && typeof raw === "object" ? raw : {};
    state.version = 2;
    state.bandProfile = state.bandProfile || { logoDataUrl: "" };
    state.members = Array.isArray(state.members) ? state.members : [];
    state.songs = Array.isArray(state.songs) ? state.songs : [];
    state.savedSetlists = Array.isArray(state.savedSetlists) ? state.savedSetlists : [];
    state.events = Array.isArray(state.events) ? state.events : [];
    state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
    state.calendarEntries = Array.isArray(state.calendarEntries) ? state.calendarEntries : [];
    state.draft = state.draft || { name: "Nový koncert", targetMinutes: 45, songIds: [] };
    state.draft.name = state.draft.name || "Nový koncert";
    const songIds = new Set(state.songs.map(song => song.id));
    [state.draft, ...state.savedSetlists].forEach(set => updateSetlistEntries(set,
      setlistEntries(set).filter(entry => entry.kind !== "song" || songIds.has(entry.id))));
    state.draft.lockedSongIds = Array.isArray(state.draft.lockedSongIds) ? state.draft.lockedSongIds.filter(id => state.draft.songIds.includes(id)) : [];
    state.draft.targetMinutes = Number(state.draft.targetMinutes) || 45;
    state.songs.forEach(song => {
      song.album = song.album || ""; song.energy = Math.min(5, Math.max(1, Number(song.energy) || 3)); song.role = ROLE_LABELS[song.role] ? song.role : "standard";
      song.bpm = Math.min(300, Math.max(0, Number(song.bpm) || 0)); song.printFields = normalizePrintFields(song.printFields, song.printTags); delete song.printTags;
      song.memberDetails = song.memberDetails && typeof song.memberDetails === "object" ? song.memberDetails : {};
      Object.values(song.memberDetails).forEach(detail => { if (detail && typeof detail === "object") { detail.printFields = normalizePrintFields(detail.printFields, detail.printTags); delete detail.printTags; } });
      if ((song.note || Number(song.capo)) && state.members[0]) {
        const first = state.members[0]; song.memberDetails[first.id] = song.memberDetails[first.id] || { note: song.note || "", capo: Number(song.capo) || 0, instrumentId: first.defaultInstrumentId || "none" };
      }
      delete song.note; delete song.capo;
    });
    state.members.forEach(member => { member.instruments = Array.isArray(member.instruments) ? member.instruments : []; member.defaultInstrumentId = member.instruments.some(item => item.id === member.defaultInstrumentId) ? member.defaultInstrumentId : "none"; member.vocals = Boolean(member.vocals); });
    state.events = state.events.filter(event => event && event.id).map(event => ({ ...event, status: event.status === "completed" ? "completed" : "planned", checklist: Array.isArray(event.checklist) ? event.checklist.filter(item => item && item.label).map(item => ({ id: String(item.id || uid("check")), label: String(item.label).slice(0, 120), done: Boolean(item.done) })) : [], playedSongIds: Array.isArray(event.playedSongIds) ? event.playedSongIds.filter(id => state.songs.some(song => song.id === id)) : [], plannedSongIds: Array.isArray(event.plannedSongIds) ? event.plannedSongIds.filter(id => state.songs.some(song => song.id === id)) : [] }));
    if (!state.draft.viewerMemberId || !state.members.some(member => member.id === state.draft.viewerMemberId)) state.draft.viewerMemberId = "clean";
    return state;
  }
  function updateSession(payload) {
    session = payload; elements.userName.textContent = payload.user?.name || payload.user?.email || "";
    const bands = payload.bands || [];
    if (!bands.length) { setScreen("onboarding"); return; }
    if (!bands.some(band => band.id === activeBandId)) activeBandId = bands[0].id;
    localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); setScreen("workspace"); loadWorkspace();
  }
  async function refreshSession() {
    try { updateSession(await api("/session")); } catch (_) { session = null; workspace = null; setScreen("auth"); }
  }
  async function loadWorkspace() {
    if (!activeBandId) return;
    try {
      const previousBand = workspace?.band.id;
      workspace = await api("/workspace?bandId=" + encodeURIComponent(activeBandId)); revision = workspace.revision; workspace.state = normalizeState(workspace.state);
      if (workspace.band.id !== previousBand) {
        rehearsalPlanShown = false;
        elements.rehearsalScope.value = "";
        elements.rehearsalMember.value = "";
        elements.taskCategoryFilter.value = "";
        elements.taskStateFilter.value = "all";
        resetTaskForm();
        bandCalendarDate = new Date();
        calendarFeedBand = "";
        elements.calendarSubscribe.open = false;
        renderCalendarFeed("");
      }
      elements.currentBandName.textContent = workspace.band.name; elements.settingsBandName.textContent = workspace.band.name; elements.inviteCode.textContent = workspace.band.inviteCode;
      elements.planStatus.textContent = workspace.subscription.status === "active" ? "Aktivní plán" : "Zkušební provoz"; elements.planName.textContent = workspace.subscription.planName || "Setlister Early";
      renderWorkspace(); renderBandDialog();
    } catch (error) { showToast(error.message); }
  }
  function bandLogo() { return workspace?.state.bandProfile?.logoDataUrl || ""; }
  function renderBrand() {
    const logo = bandLogo();
    elements.headerBandLogo.hidden = !logo; elements.headerBandLogo.src = logo || "";
    elements.logoPreview.replaceChildren();
    if (logo) { const img = document.createElement("img"); img.src = logo; img.alt = workspace.band.name; elements.logoPreview.append(img); }
    else elements.logoPreview.textContent = "LOGO";
    elements.removeBandLogo.hidden = !logo;
  }
  function songMemberDetail(song, memberId) { return song.memberDetails?.[memberId] || {}; }
  function detailSummary(song, memberId) {
    if (!memberId || memberId === "clean") return "";
    const member = memberById(memberId); const detail = songMemberDetail(song, memberId); const instrument = memberInstrument(member, detail.instrumentId || member?.defaultInstrumentId || "none");
    const parts = [];
    if (instrument.kind !== "none") parts.push(instrument.name);
    if (usesCapo(instrument) && Number(detail.capo)) parts.push("K" + detail.capo);
    if (instrument.kind === "electric-guitar" && detail.preset) parts.push(detail.preset);
    parts.push(...printFieldTexts(song.printFields), ...printFieldTexts(detail.printFields));
    if (detail.note) parts.push(detail.note);
    return parts.join(" · ");
  }
  function renderWorkspace() {
    if (!workspace) return;
    const state = workspace.state; renderBrand();
    const selected = new Set(state.draft.songIds); const query = elements.songSearch.value.trim().toLocaleLowerCase("cs");
    const currentAlbum = elements.albumFilter.value || "all"; const albums = [...new Set(state.songs.map(song => song.album).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
    elements.albumFilter.replaceChildren(option("all", "Všechna alba"), ...albums.map(album => option(album, album))); elements.albumFilter.value = albums.includes(currentAlbum) ? currentAlbum : "all";
    const available = state.songs.filter(song => !selected.has(song.id)).filter(song => !query || (song.title + " " + song.album + " " + ROLE_LABELS[song.role]).toLocaleLowerCase("cs").includes(query)).filter(song => elements.albumFilter.value === "all" || song.album === elements.albumFilter.value).filter(song => elements.energyFilter.value === "all" || String(song.energy) === elements.energyFilter.value).filter(song => elements.roleFilter.value === "all" || song.role === elements.roleFilter.value);
    const setEntries = setlistEntries(state.draft);
    const songsById = new Map(state.songs.map(song => [song.id, song]));
    const setSongs = state.draft.songIds.map(id => songsById.get(id));
    const viewer = memberById(state.draft.viewerMemberId);
    const tuning = SetlisterPlanning.tuningPlan(setSongs, viewer, memberInstrument);
    let songIndex = 0;
    elements.setName.value = state.draft.name; elements.appAvailableCount.textContent = String(available.length);
    elements.setViewer.replaceChildren(option("clean", "Bez poznámek"), ...state.members.map(member => option(member.id, member.name)));
    elements.setViewer.value = state.draft.viewerMemberId || "clean";
    elements.appAvailableSongs.replaceChildren(...available.map(song => {
      const row = document.createElement("article"); row.className = "song-item";
      const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = song.title; const album = document.createElement("span"); album.className = "song-note"; album.textContent = song.album || "Bez alba"; info.append(title, album);
      const meta = document.createElement("small"); meta.textContent = [formatTime(song.seconds), song.bpm ? song.bpm + " BPM" : "", "E" + song.energy].filter(Boolean).join(" · ");
      const actions = document.createElement("div"); actions.className = "library-actions"; actions.append(iconAction("edit", "Upravit skladbu", () => openSongDialog(song.id)), iconAction("member", "Poznámky členů", () => openNotesDialog(song.id)), iconAction("add", "Přidat do setu", () => { updateSetlistEntries(state.draft, [...setEntries, {kind: "song", id: song.id}]); changed(); }, true)); row.append(info, meta, actions); return row;
    }));
    elements.appSetSongs.replaceChildren(...setEntries.map((entry, index) => {
      const row = document.createElement("li");
      row.className = "set-item";
      row.draggable = true;
      row.addEventListener("dragstart", event => event.dataTransfer.setData("application/x-setlister-entry", String(index)));
      row.addEventListener("dragover", event => {
        if (event.dataTransfer.types.includes("application/x-setlister-entry")) event.preventDefault();
      });
      row.addEventListener("drop", event => {
        const from = event.dataTransfer.getData("application/x-setlister-entry");
        if (!from) return;
        event.preventDefault();
        moveSetEntry(Number(from), index);
      });

      const actions = document.createElement("div");
      actions.className = "row-actions set-song-actions";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      info.append(title);
      const number = document.createElement("span");
      number.className = "set-entry-number";
      const meta = document.createElement("small");
      if (entry.kind === "interlude") {
        row.classList.add("set-interlude");
        title.textContent = entry.title;
        meta.textContent = entry.seconds ? formatTime(entry.seconds) : "Pauza / intermezzo";
        actions.append(iconAction("edit", "Upravit pauzu", () => openInterludeDialog(entry)));
      } else {
        const song = songsById.get(entry.id);
        const cue = tuning[songIndex];
        if (cue) row.append(mailNode("div", "tuning-cue set-tuning", "Ladění · " + cue));
        number.textContent = String(++songIndex).padStart(2, "0");
        const detail = viewer ? songMemberDetail(song, viewer.id) : {};
        title.textContent = detail.customTitle || song.title;
        info.append(mailNode("span", "song-note",
          detailSummary(song, viewer?.id) || song.album || ROLE_LABELS[song.role]));
        const role = song.role !== "standard" ? ROLE_LABELS[song.role] : "";
        meta.textContent = [role, formatTime(song.seconds), song.bpm ? song.bpm + " BPM" : ""].filter(Boolean).join(" · ");
        const locked = state.draft.lockedSongIds.includes(song.id);
        const lock = rowButton(locked ? "●" : "○", locked ? "Odemknout pozici" : "Zamknout pozici pro chytré řazení", () => {
          const ids = state.draft.lockedSongIds;
          state.draft.lockedSongIds = locked ? ids.filter(id => id !== song.id) : [...ids, song.id];
          changed();
        });
        lock.className = "position-lock" + (locked ? " active" : "");
        actions.append(
          iconAction("edit", "Upravit skladbu", () => openSongDialog(song.id)),
          iconAction("member", "Poznámky členů", () => openNotesDialog(song.id)),
          lock
        );
      }

      const up = rowButton("↑", "Posunout nahoru", () => moveSetEntry(index, index - 1));
      const down = rowButton("↓", "Posunout dolů", () => moveSetEntry(index, index + 1));
      up.disabled = index === 0;
      down.disabled = index === setEntries.length - 1;
      actions.append(up, down, rowButton("×", "Odebrat ze setu", () => {
        setEntries.splice(index, 1);
        updateSetlistEntries(state.draft, setEntries);
        if (entry.kind === "song") state.draft.lockedSongIds = state.draft.lockedSongIds.filter(id => id !== entry.id);
        changed();
      }));
      row.append(number, info, meta, actions);
      return row;
    }));
    elements.appSetEmpty.hidden = setEntries.length > 0;
    elements.addInterlude.disabled = state.draft.interludes.length >= 50;
    const total = setSongs.reduce((sum, song) => sum + Number(song.seconds || 0), 0)
      + state.draft.interludes.reduce((sum, entry) => sum + entry.seconds, 0);
    const target = Math.max(1, Number(state.draft.targetMinutes) || 45) * 60;
    elements.appTotalTime.textContent = formatTime(total); elements.appTargetLabel.textContent = "z " + formatTime(target); elements.appTargetMinutes.value = String(state.draft.targetMinutes || 45); elements.appProgress.style.width = Math.min(100, total / target * 100) + "%"; elements.appProgress.classList.toggle("over", total > target);
    renderRepertoire(); renderSettings(); renderSavedSetlists(); renderEvents(); renderLiveSetup();
    if (elements.rehearsalPlanner.closest(".app-view").classList.contains("active")) renderRehearsalPlanner();
    if (elements.taskForm.closest(".app-view").classList.contains("active")) renderTasks();
    if (!elements.bandCalendar.hidden) renderBandCalendar();
    enhanceSelects(document);
  }
  function option(value, label) { const node = document.createElement("option"); node.value = value; node.textContent = label; return node; }
  function rowButton(label, title, action) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.title = title; button.addEventListener("click", action); return button; }
  function iconAction(kind, label, action, primary = false) {
    const icons = { edit: '<path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm17-10.6c.4-.4.4-1 0-1.4L19.5 3c-.4-.4-1-.4-1.4 0l-1.6 1.6L20 8.1 21 7Z"/>', member: '<path d="M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-2c0-3 2.8-5 6.5-5s6.5 2 6.5 5v2H2Zm13-7c3.1.1 7 1.6 7 5v2h-5v-2c0-1.9-.7-3.7-2-5Z"/>', add: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/>', load: '<path d="M12 3a9 9 0 1 0 8.5 6h-2.2A7 7 0 1 1 12 5c1.9 0 3.6.8 4.8 2H14v2h6V3h-2v2.1A9 9 0 0 0 12 3Z"/>' };
    const button = document.createElement("button"); button.type = "button"; button.className = "icon-action " + (primary ? "primary" : ""); button.title = label; button.setAttribute("aria-label", label); button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[kind]}</svg><span>${label}</span>`; button.addEventListener("click", action); return button;
  }
  function moveSetEntry(from, to) {
    const draft = workspace.state.draft;
    const entries = setlistEntries(draft);
    if (!Number.isInteger(from) || from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    updateSetlistEntries(draft, entries);
    changed();
  }
  function openInterludeDialog(entry) {
    const form = elements.interludeForm;
    form.elements.interludeId.value = entry?.id || "";
    form.elements.title.value = entry?.title || "Pauza";
    form.elements.duration.value = entry?.seconds ? formatTime(entry.seconds) : "";
    showStatus(elements.interludeStatus, "");
    elements.interludeDialog.showModal();
    form.elements.title.select();
  }
  function saveInterlude(form) {
    const data = formPayload(form);
    const title = data.title.trim();
    const duration = data.duration.trim();
    const seconds = parseDuration(duration);
    if (!title || (duration && (!/^(?:\d+|\d{1,2}:[0-5]\d)$/.test(duration) || seconds > 3600))) {
      showStatus(elements.interludeStatus, "Zadej název a případně délku do 60 minut.");
      return;
    }
    const draft = workspace.state.draft;
    const existing = draft.interludes.find(item => item.id === data.interludeId);
    if (existing) {
      Object.assign(existing, { title, seconds });
    } else if (draft.interludes.length < 50) {
      draft.interludes.push({ id: uid("interlude"), title, seconds, position: draft.songIds.length });
    } else {
      showStatus(elements.interludeStatus, "Do setlistu se vejde nejvýše 50 pauz.");
      return;
    }
    elements.interludeDialog.close();
    changed();
  }
  function renderRepertoire() {
    elements.appRepertoire.replaceChildren(...workspace.state.songs.map(song => {
      const row = document.createElement("article"); row.className = "repertoire-row";
      const title = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = song.title; const album = document.createElement("span"); album.className = "song-note"; album.textContent = song.album || "Bez alba"; title.append(strong, album);
      const energy = document.createElement("span"); energy.className = "energy"; energy.textContent = "Energie " + song.energy;
      const meta = document.createElement("small"); meta.textContent = [formatTime(song.seconds), song.bpm ? song.bpm + " BPM" : "", song.role !== "standard" ? ROLE_LABELS[song.role] : ""].filter(Boolean).join(" · ");
      const actions = document.createElement("div"); actions.className = "repertoire-actions"; actions.append(iconAction("edit", "Upravit skladbu", () => openSongDialog(song.id)), iconAction("member", "Poznámky členů", () => openNotesDialog(song.id)), rowButton("×", "Odstranit skladbu", () => deleteSong(song.id))); row.append(title, energy, meta, actions); return row;
    }));
  }
  function deleteSong(id) {
    const song = workspace.state.songs.find(item => item.id === id); if (!song || !window.confirm("Opravdu odstranit skladbu „" + song.title + "“?")) return;
    const state = workspace.state;
    state.songs = state.songs.filter(item => item.id !== id);
    [state.draft, ...state.savedSetlists].forEach(set => updateSetlistEntries(set,
      setlistEntries(set).filter(entry => entry.kind !== "song" || entry.id !== id)));
    state.draft.lockedSongIds = state.draft.lockedSongIds.filter(songId => songId !== id);
    state.events.forEach(event => { event.playedSongIds = event.playedSongIds.filter(songId => songId !== id); });
    changed();
  }
  function renderSettings() {
    elements.inviteCode.textContent = workspace.band.inviteCode; elements.settingsBandName.textContent = workspace.band.name;
    elements.memberList.replaceChildren(...workspace.state.members.map(member => {
      const row = document.createElement("div"); row.className = "member"; const info = document.createElement("div"); const name = document.createElement("strong"); name.textContent = member.name; const instruments = document.createElement("small"); const instrumentNames = member.instruments.map(item => item.name); instruments.textContent = [...instrumentNames, ...(member.vocals ? ["Zpěv"] : []), "Výchozí: " + memberInstrument(member, member.defaultInstrumentId || "none").name].join(" · "); info.append(name, instruments);
      const status = document.createElement("span"); status.className = "member-status"; status.textContent = accountById(member.linkedUserId)?.email || "bez účtu";
      const actions = document.createElement("div"); actions.className = "row-actions"; actions.append(rowButton("✎", "Upravit člena", () => openMemberDialog(member.id)), rowButton("×", "Odstranit člena", () => deleteMember(member.id))); row.append(info, status, actions); return row;
    }));
    elements.rotateCode.hidden = workspace.membership.role !== "owner";
  }
  function deleteMember(id) {
    const member = memberById(id); if (!member || !window.confirm("Opravdu odstranit člena „" + member.name + "“ ze setlistů?")) return;
    workspace.state.members = workspace.state.members.filter(item => item.id !== id); workspace.state.songs.forEach(song => { delete song.memberDetails[id]; if (song.readiness) delete song.readiness[id]; }); if (workspace.state.draft.viewerMemberId === id) workspace.state.draft.viewerMemberId = "clean"; changed();
  }
  function renderSavedSetlists() {
    const sets = workspace.state.savedSetlists;
    if (!sets.length) { const p = document.createElement("p"); p.className = "section-help"; p.textContent = "Zatím tu není žádný uložený setlist."; elements.savedSetlists.replaceChildren(p); return; }
    elements.savedSetlists.replaceChildren(...sets.map(set => {
      const row = document.createElement("article"); const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = set.name; const meta = document.createElement("small"); meta.textContent = set.songIds.length + " skladeb · cíl " + set.targetMinutes + " min"; info.append(title, meta);
      const actions = document.createElement("div"); actions.className = "saved-actions"; actions.append(iconAction("load", "Načíst setlist", () => loadSavedSetlist(set.id), true), rowButton("×", "Smazat uložený setlist", () => { workspace.state.savedSetlists = sets.filter(item => item.id !== set.id); workspace.state.events.forEach(event => { if (event.setlistId === set.id) event.setlistId = ""; }); changed(); })); row.append(info, actions); return row;
    }));
  }
  function savedSetlistById(id) { return workspace?.state.savedSetlists.find(set => set.id === id) || null; }
  function showAppView(name) {
    document.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === name));
    document.querySelectorAll("[data-app-view]").forEach(view => view.classList.toggle("active", view.dataset.appView === name));
    if (name === "agent") {
      window.scrollTo(0, 0);
      loadMailAgentStatus();
    }
    if (!workspace) return;
    if (name === "live") {
      renderRehearsalPlanner();
      enhanceSelects(elements.rehearsalPlanner);
    }
    if (name === "tasks") renderTasks();
    if (name === "events" && !elements.bandCalendar.hidden) renderBandCalendar();
  }

  function mailDate(value) {
    if (!value) return "Ještě nesynchronizováno";
    const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
  }
  function mailNode(tag, className = "", text = "") { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function updateMailChatAvailability(ready) {
    elements.mailQuestion.disabled = !ready; elements.mailChatForm.querySelector("button").disabled = !ready || mailAgentWaiting; elements.mailQuickPrompts.querySelectorAll("button").forEach(button => { button.disabled = !ready || mailAgentWaiting; }); elements.mailChatReadiness.textContent = ready ? "Schránka je připravená" : "Nejdřív dokonči synchronizaci"; elements.mailChatReadiness.classList.toggle("ready", ready);
  }
  function renderMailAgentStatus(status) {
    mailAgentStatus = status; const accounts = status.accounts || []; const ready = accounts.some(account => account.sync_state === "ready" && Number(account.message_count) > 0); const syncing = accounts.some(account => account.sync_state === "syncing");
    const initialSyncDone = accounts.some(account => account.last_sync_at) || ready;
    if (!mailSetupInitialized || initialSyncDone !== mailSetupWasReady) elements.mailAgentSetup.open = !initialSyncDone;
    mailSetupInitialized = true;
    mailSetupWasReady = initialSyncDone;
    const mailboxSummary = accounts.length === 1 ? "1 schránka" : accounts.length === 2 ? "2 schránky" : "Bez připojené schránky";
    elements.mailSetupSummary.textContent = syncing ? mailboxSummary + " · načítání zpráv" : mailboxSummary;
    if (!status.gmailConfigured) elements.mailAgentStatus.textContent = "Provozovatel ještě musí doplnit Google OAuth údaje."; else if (!status.openaiConfigured) elements.mailAgentStatus.textContent = "Provozovatel ještě musí doplnit OpenAI API klíč."; else elements.mailAgentStatus.textContent = accounts.length ? `Připojeno ${accounts.length} ze 2 účtů` : "Zatím není připojený žádný Gmail.";
    elements.connectGmail.hidden = !status.canManage || accounts.length >= 2;
    elements.connectGmail.disabled = !status.gmailConfigured;
    const rows = accounts.map(account => {
      const row = mailNode("article", "gmail-account"); const main = mailNode("div", "gmail-account-main"); const icon = mailNode("span", "gmail-account-icon", account.email.slice(0, 1).toUpperCase()); const text = mailNode("div"); text.append(mailNode("strong", "", account.email), mailNode("small", "", `${Number(account.message_count || 0).toLocaleString("cs-CZ")} zpráv · ${mailDate(account.last_sync_at)}`)); main.append(icon, text);
      const actions = mailNode("div", "gmail-account-actions"); const stateLabels = { awaiting_initial: "Čeká na první načtení", syncing: "Synchronizuji…", ready: "Aktuální", paused: "Bezpečně pozastaveno", error: "Chyba synchronizace" }; const state = mailNode("span", `gmail-state ${account.sync_state === "error" ? "error" : account.sync_state === "syncing" || account.sync_state === "paused" ? "syncing" : ""}`, stateLabels[account.sync_state] || "Připojeno"); if (account.last_sync_error) state.title = account.last_sync_error; actions.append(state);
      if (status.canManage) { const sync = mailNode("button", "secondary-button", account.sync_state === "awaiting_initial" ? "Načíst celou schránku" : account.sync_state === "syncing" ? "Probíhá…" : account.sync_state === "paused" ? "Pokračovat" : account.sync_state === "error" ? "Zkusit znovu" : "Načíst nové zprávy"); sync.type = "button"; sync.disabled = account.sync_state === "syncing"; sync.addEventListener("click", () => syncMailConnection(account.id, account.sync_state === "awaiting_initial")); const remove = mailNode("button", "quiet-button", "Odpojit"); remove.type = "button"; remove.disabled = account.sync_state === "syncing"; remove.addEventListener("click", () => disconnectMailConnection(account)); actions.append(sync, remove); }
      row.append(main, actions); return row;
    });
    if (!rows.length) rows.push(mailNode("div", "mail-account-empty", status.canManage ? "Připoj první kapelní Gmail. Po autorizaci načteš celou jeho schránku." : "Vlastník kapely zatím nepřipojil žádný Gmail.")); elements.gmailAccountList.replaceChildren(...rows); updateMailChatAvailability(ready);
    renderConcertIndex(status);
    clearTimeout(mailAgentPollTimer);
    const index = status.concertIndex;
    if (syncing || (index && index.pending > index.failed)) {
      mailAgentPollTimer = setTimeout(() => loadMailAgentStatus(true), syncing ? 2500 : 20000);
    }
  }
  function renderConcertIndex(status) {
    const index = status.concertIndex;
    if (!index) {
      elements.concertIndexStatus.textContent = "Stav přehledu zatím není dostupný.";
      return;
    }
    if (!status.accounts.length) {
      elements.concertIndexStatus.textContent = "Přehled začne po připojení a načtení Gmailu.";
      return;
    }
    const parts = [];
    if (index.pending > index.failed) parts.push(`Čeká na zpracování: ${index.pending - index.failed}`);
    if (index.failed) parts.push(`Vlákna s chybou: ${index.failed}`);
    if (index.incompleteInboxes) parts.push(`Neaktuální schránky: ${index.incompleteInboxes}`);
    if (!parts.length) parts.push(index.asOf ? "Přehled je připravený" : "Čeká na synchronizaci Gmailu");
    if (index.asOf) parts.push(`Stav e-mailů k ${mailDate(index.asOf)}`);
    elements.concertIndexStatus.textContent = parts.join(" · ");
  }
  async function loadMailAgentStatus(quiet = false) {
    const band = activeBandId;
    if (!band) return;
    if (mailConversationBandId !== band) {
      mailConversationBandId = band;
      mailConversation = [];
      mailSetupInitialized = false;
      resetMailConversation();
    }
    try {
      const status = await api("/gmail/status?bandId=" + encodeURIComponent(band));
      if (activeBandId === band) renderMailAgentStatus(status);
    } catch (error) {
      if (activeBandId !== band) return;
      if (!quiet) showToast(error.message);
      elements.mailAgentStatus.textContent = error.message;
    }
  }
  async function connectGmail() { try { const result = await api("/gmail/connect?bandId=" + encodeURIComponent(activeBandId)); window.location.assign(result.authorizationUrl); } catch (error) { showToast(error.message); } }
  async function syncMailConnection(connectionId, full) {
    try { await api("/gmail/sync", { method: "POST", body: JSON.stringify({ bandId: activeBandId, connectionId, full }) }); showToast(full ? "Načítání celé schránky bylo spuštěné." : "Kontroluji nové zprávy."); await loadMailAgentStatus(true); } catch (error) { showToast(error.message); }
  }
  async function disconnectMailConnection(account) {
    if (!window.confirm(`Odpojit ${account.email}? Lokální index tohoto účtu se odstraní, v Gmailu se nic nezmění.`)) return;
    try { await api("/gmail/disconnect", { method: "POST", body: JSON.stringify({ bandId: activeBandId, connectionId: account.id }) }); showToast("Gmail byl odpojený. Jeho zprávy byly ze Setlisteru odstraněné."); await loadMailAgentStatus(); } catch (error) { showToast(error.message); }
  }
  function resetMailConversation() { elements.mailChatMessages.innerHTML = '<article class="mail-message assistant"><span>A</span><p>Až bude schránka načtená, zeptej se vlastními slovy. Pokud odpověď v e-mailech nenajdu, řeknu to otevřeně.</p></article>'; }
  function appendMailInline(parent, text, sourceMap) {
    const pattern = /\*\*([^*]+)\*\*|\[(M\d+)\]/g; let cursor = 0;
    for (const match of text.matchAll(pattern)) { if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index))); if (match[1] !== undefined) parent.append(mailNode("strong", "", match[1])); else { const source = sourceMap.get(match[2]); if (source?.url) { const link = mailNode("a", "", "e-mail ↗"); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.title = source.subject || "Otevřít zdrojový e-mail"; parent.append(link); } else parent.append(mailNode("span", "", "zdroj")); } cursor = match.index + match[0].length; }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }
  function renderMailAnswer(answer, sources = []) {
    const root = mailNode("div", "mail-answer"); const sourceMap = new Map(sources.map(source => [source.id, source])); const lines = String(answer || "").replace(/\r/g, "").split("\n"); let index = 0;
    while (index < lines.length) { const line = lines[index].trim(); if (!line) { index += 1; continue; } const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/); if (bullet) { const ordered = /^\d/.test(line); const list = mailNode(ordered ? "ol" : "ul"); while (index < lines.length) { const item = lines[index].trim().match(ordered ? /^\d+[.)]\s+(.+)$/ : /^(?:[-*•])\s+(.+)$/); if (!item) break; const li = mailNode("li"); appendMailInline(li, item[1], sourceMap); list.append(li); index += 1; } root.append(list); continue; } const paragraph = mailNode("p"); appendMailInline(paragraph, line.replace(/^#{1,4}\s+/, ""), sourceMap); root.append(paragraph); index += 1; }
    return root;
  }
  function addMailMessage(role, content, sources = []) { const message = mailNode("article", "mail-message " + role); if (role === "assistant") message.append(mailNode("span", "", "A")); if (role === "assistant") message.append(renderMailAnswer(content, sources)); else message.append(mailNode("p", "", content)); elements.mailChatMessages.append(message); elements.mailChatMessages.scrollTop = elements.mailChatMessages.scrollHeight; return message; }
  async function askMailAgent(question) {
    if (mailAgentWaiting || !question.trim()) return; mailAgentWaiting = true; elements.mailQuestion.value = ""; elements.mailQuestion.style.height = "auto"; addMailMessage("user", question); const loading = mailNode("article", "mail-message assistant"); loading.append(mailNode("span", "", "A")); const dots = mailNode("p", "mail-loading"); dots.append(mailNode("i"), mailNode("i"), mailNode("i")); loading.append(dots); elements.mailChatMessages.append(loading); updateMailChatAvailability(true);
    try { const result = await api("/mail-agent/ask", { method: "POST", body: JSON.stringify({ bandId: activeBandId, question, history: mailConversation.slice(-6) }) }); loading.remove(); addMailMessage("assistant", result.answer, result.sources || []); mailConversation.push({ role: "user", content: question }, { role: "assistant", content: result.answer }); } catch (error) { loading.remove(); addMailMessage("assistant", "Odpověď se nepodařilo získat: " + error.message); } finally { mailAgentWaiting = false; updateMailChatAvailability((mailAgentStatus?.accounts || []).some(account => account.sync_state === "ready" && Number(account.message_count) > 0)); elements.mailQuestion.focus(); }
  }
  function loadSavedSetlist(id) {
    const set = savedSetlistById(id); if (!set) { showToast("Přiřazený setlist už neexistuje."); return; }
    workspace.state.draft = { ...workspace.state.draft, name: set.name, targetMinutes: set.targetMinutes, songIds: [...set.songIds], interludes: set.interludes.map(item => ({ ...item })), lockedSongIds: [] }; changed(); showAppView("setlist"); showToast("„" + set.name + "“ je otevřený v editoru.");
  }
  function eventSetlist(event) { return savedSetlistById(event?.setlistId); }
  function scopedRehearsalSongs(scope) {
    const { songs, draft } = workspace.state;
    if (scope === "all") return songs;
    const ids = scope === "draft" ? draft.songIds : savedSetlistById(scope.slice(6))?.songIds || [];
    const lookup = new Map(songs.map(song => [song.id, song]));
    return [...new Set(ids)].map(id => lookup.get(id)).filter(Boolean);
  }
  function openRehearsalForSet(set) {
    showAppView("live");
    elements.rehearsalScope.value = "saved:" + set.id;
    elements.rehearsalScope.dispatchEvent(new Event("change"));
    elements.rehearsalTitle.focus({ preventScroll: true });
    elements.rehearsalPlanner.scrollIntoView({ block: "start" });
  }
  function renderRehearsalPlanner() {
    const state = workspace.state;
    const scope = elements.rehearsalScope.value || (state.draft.songIds.length ? "draft" : "all");
    const options = [option("draft", "Aktuální set — " + state.draft.name), option("all", "Celý repertoár"),
      ...state.savedSetlists.map(set => option("saved:" + set.id, set.name))];
    elements.rehearsalScope.replaceChildren(...options);
    elements.rehearsalScope.value = options.some(item => item.value === scope) ? scope : "draft";
    const songs = scopedRehearsalSongs(elements.rehearsalScope.value);
    const own = signedInMemberId();
    const editable = workspace.membership.role === "owner" ? state.members : state.members.filter(member => member.id === own);
    const memberId = editable.some(member => member.id === elements.rehearsalMember.value)
      ? elements.rehearsalMember.value : own || editable[0]?.id || "";
    elements.rehearsalMember.replaceChildren(...editable.map(member => option(member.id, member.name)));
    elements.rehearsalMember.value = memberId;
    elements.rehearsalMemberField.hidden = !editable.length;
    elements.rehearsalMemberHelp.hidden = Boolean(editable.length);
    elements.rehearsalMemberHelp.textContent = state.members.length
      ? "Pro vlastní hodnocení propoj účet se členem v sekci Kapela a účet."
      : "Nejdřív přidej pódiové členy v sekci Kapela a účet.";
    const readyCount = state.members.length ? songs.filter(song =>
      state.members.every(member => song.readiness?.[member.id] === "ready")).length : 0;
    elements.rehearsalReadySummary.textContent = `${readyCount} / ${songs.length} skladeb připraveno`;
    const rows = songs.map(song => {
      const row = mailNode("div", "planning-row");
      const info = mailNode("div");
      info.append(mailNode("strong", "", song.title));
      const groups = SetlisterPlanning.readiness(song, state.members);
      for (const [key, label] of Object.entries({ ...SetlisterPlanning.readinessLabels, unknown: "Bez hodnocení" })) {
        if (!groups[key].length) continue;
        info.append(mailNode("small", "readiness-" + key, label + " · " + groups[key].map(member => member.name).join(", ")));
      }
      row.append(info);
      if (memberId) {
        const select = document.createElement("select");
        select.id = "readiness-" + song.id;
        select.setAttribute("aria-label", "Připravenost – " + song.title);
        select.append(option("", "Bez hodnocení"), ...Object.entries(SetlisterPlanning.readinessLabels)
          .map(([value, label]) => option(value, label)));
        select.value = song.readiness?.[memberId] || "";
        select.addEventListener("change", () => {
          song.readiness = { ...(song.readiness || {}) };
          if (select.value) song.readiness[memberId] = select.value;
          else delete song.readiness[memberId];
          changed();
          const replacement = document.getElementById(select.id);
          replacement?.parentElement.querySelector("[role=combobox]")?.focus();
        });
        row.append(select);
      }
      return row;
    });
    elements.rehearsalReadinessRows.replaceChildren(...(rows.length ? rows :
      [mailNode("p", "section-help", "Ve vybraném setlistu nejsou žádné skladby.")]));
    if (rehearsalPlanShown) renderRehearsalPreview(songs);
    else elements.rehearsalPlanPreview.hidden = true;
  }
  function renderRehearsalPreview(songs = scopedRehearsalSongs(elements.rehearsalScope.value)) {
    const minutes = Number(elements.rehearsalMinutes.value);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 360) {
      elements.rehearsalPlanSummary.textContent = "Zadej délku od 5 do 360 minut.";
      elements.rehearsalPlanItems.replaceChildren();
      elements.rehearsalPlanPreview.hidden = false;
      return;
    }
    const plan = SetlisterPlanning.buildPlan(songs, workspace.state.members, minutes);
    elements.rehearsalPlanPreview.hidden = false;
    const details = plan.items.length
      ? [plan.items.length + (plan.items.length === 1 ? " skladba" : plan.items.length < 5 ? " skladby" : " skladeb"),
        formatTime(plan.total) + " z " + minutes + ":00",
        plan.omittedPriority ? "Prioritní skladby mimo čas: " + plan.omittedPriority : ""].filter(Boolean)
      : [songs.length ? "Do vybraného času se žádná skladba nevejde." : "Ve vybraném setlistu nejsou skladby."];
    elements.rehearsalPlanSummary.textContent = details.join(" · ");
    const tuning = SetlisterPlanning.tuningPlan(plan.items.map(item => item.song), liveMember(), memberInstrument);
    elements.rehearsalPlanItems.replaceChildren(...plan.items.map(({ song, state, duration }, index) => {
      const row = mailNode("li", "planning-row");
      const info = mailNode("div");
      const reasons = [
        state.unlearned.length ? "Nenacvičeno · " + state.unlearned.map(member => member.name).join(", ") : "",
        state.practice.length ? "Dopilovat · " + state.practice.map(member => member.name).join(", ") : "",
        state.unknown.length ? "Ověřit připravenost" : "",
      ].filter(Boolean);
      if (tuning[index]) info.append(mailNode("div", "tuning-cue", "Ladění · " + tuning[index]));
      info.append(mailNode("strong", "", song.title), mailNode("small", "", reasons.join(" / ") || "Průchod skladbou"));
      row.append(info, mailNode("span", "planning-time", formatTime(duration)));
      return row;
    }));
  }
  function resetTaskForm() {
    elements.taskForm.reset();
    elements.taskAssignee.value = "";
    elements.saveTask.textContent = "Přidat úkol";
    elements.cancelTaskEdit.hidden = true;
  }
  function editTask(task) {
    const form = elements.taskForm;
    form.elements.taskId.value = task.id;
    form.elements.title.value = task.title;
    form.elements.category.value = task.category;
    form.elements.deadline.value = task.deadline ? formatEventDate(task.deadline) : "";
    elements.taskAssignee.value = task.assigneeUserId;
    enhanceSelect(elements.taskAssignee);
    elements.saveTask.textContent = "Uložit úkol";
    elements.cancelTaskEdit.hidden = false;
    elements.taskTitle.focus();
  }
  function taskEvent(eventId) {
    return eventId ? workspace.state.events.find(event => event.id === eventId) : null;
  }
  function openConcertCard(event) {
    showAppView("events");
    showConcertCalendar(false);
    const card = document.getElementById("event-card-" + event.id);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "start" });
  }
  function renderTasks() {
    const tasks = workspace.state.tasks;
    const categoryFilter = elements.taskCategoryFilter;
    const categories = new Map();
    for (const task of tasks) {
      const key = normalizedText(task.category);
      if (key && !categories.has(key)) categories.set(key, task.category);
    }
    const picked = categoryFilter.value;
    categoryFilter.replaceChildren(option("", "Všechny kategorie"), ...[...categories]
      .sort((a, b) => a[1].localeCompare(b[1], "cs")).map(([key, name]) => option(key, name)));
    categoryFilter.value = categories.has(picked) ? picked : "";
    const assignee = elements.taskAssignee.value;
    elements.taskAssignee.replaceChildren(option("", "Bez přiřazení"), ...workspace.members.map(member =>
      option(member.id, member.name + (member.id === session.user.id ? " (já)" : ""))));
    elements.taskAssignee.value = workspace.members.some(member => member.id === assignee) ? assignee : "";
    enhanceSelect(categoryFilter);
    enhanceSelect(elements.taskAssignee);
    const status = elements.taskStateFilter.value || "all";
    const today = SetlisterPlanning.dateKey(new Date());
    const visible = tasks.filter(task => (!categoryFilter.value || categoryFilter.value === normalizedText(task.category))
      && (status === "all" || task.done === (status === "completed")))
      .sort((a, b) => Number(a.done) - Number(b.done)
        || (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31"));
    elements.taskSummary.textContent = `${tasks.filter(task => !task.done).length} otevřených · ${tasks.filter(task => task.done).length} hotových`;
    elements.taskList.replaceChildren(...(visible.length ? visible.map(task => {
      const row = mailNode("li", "task-row");
      row.classList.toggle("done", task.done);
      const label = mailNode("label", "task-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.done;
      checkbox.id = "task-check-" + task.id;
      checkbox.setAttribute("aria-label", "Hotovo – " + task.title);
      checkbox.addEventListener("change", () => {
        task.done = checkbox.checked;
        changed();
        (document.getElementById(checkbox.id) || elements.taskStateFilter.parentElement.querySelector("[role=combobox]"))?.focus();
      });
      label.append(checkbox, mailNode("strong", "", task.title));
      const info = mailNode("div", "task-info");
      info.append(label);
      const event = taskEvent(task.eventId);
      const meta = mailNode("div", "task-tags");
      if (task.category) meta.append(mailNode("span", "task-category", task.category));
      if (event) {
        const concertTime = parseClock(event.showStart);
        const concert = rowButton(
          [event.name, formatEventDate(event.date), concertTime ? "hraní " + concertTime : ""].filter(Boolean).join(" · "),
          "Přejít na koncert " + event.name, () => openConcertCard(event)
        );
        concert.className = "task-concert";
        meta.append(concert);
      }
      if (meta.children.length) info.append(meta);
      const facts = mailNode("div", "task-facts");
      const assignee = mailNode("div");
      assignee.append(mailNode("span", "", "Má na starost"),
        mailNode("b", "", accountById(task.assigneeUserId)?.name || "Bez přiřazení"));
      const deadline = mailNode("div", !task.done && task.deadline && task.deadline < today ? "overdue" : "");
      deadline.append(mailNode("span", "", task.deadline && task.deadline < today && !task.done ? "Termín po splatnosti" : "Termín úkolu"),
        mailNode("b", "", task.deadline ? formatEventDate(task.deadline) : "Bez termínu"));
      facts.append(assignee, deadline);
      const actions = mailNode("div", "task-actions");
      const edit = iconAction("edit", "Upravit úkol", () => editTask(task));
      const remove = rowButton("×", "Odstranit úkol", () => {
        if (!window.confirm("Odstranit úkol „" + task.title + "“?")) return;
        workspace.state.tasks = tasks.filter(item => item.id !== task.id);
        if (elements.taskForm.elements.taskId.value === task.id) resetTaskForm();
        changed();
      });
      remove.setAttribute("aria-label", "Odstranit úkol");
      actions.append(edit, remove);
      row.append(info, facts, actions);
      return row;
    }) : [mailNode("li", "section-help", "V tomto výběru nejsou žádné úkoly.")]));
  }
  function saveTaskForm(form) {
    const data = formPayload(form);
    const title = data.title.trim();
    if (!title) { showToast("Napiš, co je potřeba udělat."); return; }
    const deadline = parseEventDate(data.deadline);
    if (data.deadline.trim() && !deadline) { showToast("Zadej platný termín ve formátu 21. 1. 2027."); return; }
    const list = workspace.state.tasks;
    const existing = list.find(task => task.id === data.taskId);
    if (!existing && list.length >= 1000) { showToast("Kapela už má 1 000 úkolů."); return; }
    const task = existing || { id: uid("task"), done: false };
    Object.assign(task, { title, category: data.category.trim(), deadline, assigneeUserId: data.assigneeUserId });
    if (!existing) {
      list.push(task);
      if (elements.taskStateFilter.value === "completed") elements.taskStateFilter.value = "open";
      if (elements.taskCategoryFilter.value && elements.taskCategoryFilter.value !== normalizedText(task.category))
        elements.taskCategoryFilter.value = "";
    }
    resetTaskForm();
    changed();
    elements.taskTitle.focus();
  }
  function closeEventCalendar(restoreFocus = false) {
    elements.eventCalendar.hidden = true;
    elements.eventCalendarToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) elements.eventCalendarToggle.focus();
  }
  function chooseEventDate(day) {
    elements.eventDateInput.value = formatEventDate(SetlisterPlanning.dateKey(day));
    elements.eventDateInput.setCustomValidity("");
    closeEventCalendar(true);
  }
  function renderEventCalendar(focusDay = false) {
    const month = eventCalendarCursor.getMonth();
    const year = eventCalendarCursor.getFullYear();
    const selected = parseEventDate(elements.eventDateInput.value);
    const today = SetlisterPlanning.dateKey(new Date());
    const focusKey = SetlisterPlanning.dateKey(eventCalendarCursor);
    const fullFormatter = new Intl.DateTimeFormat("cs-CZ", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    elements.eventCalendarMonth.textContent = new Intl.DateTimeFormat("cs-CZ", {
      month: "long", year: "numeric",
    }).format(eventCalendarCursor);
    elements.eventCalendarPrevious.disabled = year === 1900 && month === 0;
    elements.eventCalendarNext.disabled = year === 9999 && month === 11;
    let target;
    const buttons = SetlisterPlanning.calendarDays(eventCalendarCursor).map(day => {
      const key = SetlisterPlanning.dateKey(day);
      const button = rowButton(String(day.getDate()), fullFormatter.format(day), () => chooseEventDate(day));
      button.setAttribute("aria-label", fullFormatter.format(day));
      button.setAttribute("aria-pressed", String(key === selected));
      if (key === today) button.setAttribute("aria-current", "date");
      button.classList.toggle("outside", day.getMonth() !== month);
      button.disabled = day.getFullYear() < 1900 || day.getFullYear() > 9999;
      button.tabIndex = key === focusKey ? 0 : -1;
      if (key === focusKey) target = button;
      button.addEventListener("keydown", event => {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!offset) return;
        event.preventDefault();
        const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset);
        if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
        eventCalendarCursor = next;
        renderEventCalendar(true);
      });
      return button;
    });
    elements.eventCalendarDays.replaceChildren(...buttons);
    if (focusDay) target?.focus();
  }
  function toggleEventCalendar() {
    if (!elements.eventCalendar.hidden) return closeEventCalendar(true);
    const selected = parseEventDate(elements.eventDateInput.value);
    eventCalendarCursor = selected ? SetlisterPlanning.dateFromKey(selected) : new Date();
    closeCustomSelects();
    elements.eventCalendar.hidden = false;
    elements.eventCalendarToggle.setAttribute("aria-expanded", "true");
    renderEventCalendar(true);
  }
  function moveEventCalendarMonth(offset) {
    const next = new Date(eventCalendarCursor.getFullYear(), eventCalendarCursor.getMonth() + offset, 1);
    if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
    eventCalendarCursor = next;
    renderEventCalendar();
  }
  const calendarPalette = ["#73c3ff", "#ff92ae", "#c1a6ff", "#ffba76", "#4fdcb7", "#f69cff", "#ffe382", "#abc4ff"];
  function calendarColor(userId) {
    const index = workspace.members.findIndex(member => member.id === userId);
    return index < 0 ? "#969a9e" : calendarPalette[index] || `hsl(${Math.round(index * 137.5) % 360} 72% 69%)`;
  }
  function showConcertCalendar(show) {
    elements.concertAgenda.hidden = show;
    elements.bandCalendar.hidden = !show;
    elements.concertAgendaTab.setAttribute("aria-pressed", String(!show));
    elements.concertCalendarTab.setAttribute("aria-pressed", String(show));
    if (show) renderBandCalendar();
  }
  function calendarEntriesForDay(day) {
    const { events, calendarEntries } = workspace.state;
    return [
      ...events.filter(event => event.date === day).map(event => ({
        id: event.id, title: event.name, color: "var(--lime)", event, label: "Koncert",
      })),
      ...calendarEntries.filter(entry => entry.startDate <= day && entry.endDate >= day).map(entry => ({
        id: entry.id, title: entry.title, color: calendarColor(entry.userId), entry,
        label: accountById(entry.userId)?.name || "Bývalý člen",
      })),
    ];
  }
  function renderBandCalendar() {
    if (!workspace) return;
    const dateLabel = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" });
    elements.bandCalendarMonth.textContent = dateLabel.format(bandCalendarDate);
    const selected = SetlisterPlanning.dateKey(bandCalendarDate);
    const today = SetlisterPlanning.dateKey(new Date());
    elements.bandCalendarDays.replaceChildren(...SetlisterPlanning.calendarDays(bandCalendarDate).map(day => {
      const key = SetlisterPlanning.dateKey(day);
      const entries = calendarEntriesForDay(key);
      const button = rowButton("", formatEventDate(key, true), () => {
        bandCalendarDate = day;
        renderBandCalendar();
        elements.calendarDayHeading.focus({ preventScroll: true });
        elements.calendarDayHeading.scrollIntoView({ block: "nearest" });
      });
      button.id = "calendar-day-" + key;
      button.className = "band-calendar-day";
      button.classList.toggle("outside", day.getMonth() !== bandCalendarDate.getMonth());
      button.setAttribute("aria-label", formatEventDate(key, true) + (entries.length ? `, zápisů: ${entries.length}` : ""));
      button.setAttribute("aria-pressed", String(key === selected));
      if (key === today) button.setAttribute("aria-current", "date");
      button.append(mailNode("span", "", String(day.getDate())));
      for (const item of entries.slice(0, 3)) {
        const time = parseClock(item.event?.showStart);
        const chip = mailNode("span", "calendar-chip", (time ? time + " " : "") + item.title);
        chip.style.setProperty("--calendar-color", item.color);
        button.append(chip);
      }
      if (entries.length > 3) button.append(mailNode("small", "", "+" + (entries.length - 3)));
      return button;
    }));
    const people = workspace.members.map(member => ({ label: member.name, color: calendarColor(member.id) }));
    elements.bandCalendarLegend.replaceChildren(...[{ label: "Koncert", color: "var(--lime)" }, ...people]
      .map(({ label, color }) => {
        const item = mailNode("span", "calendar-legend-item", label);
        item.style.setProperty("--calendar-color", color);
        item.prepend(mailNode("i"));
        return item;
      }));
    elements.calendarDayHeading.textContent = formatEventDate(selected, true);
    const entries = calendarEntriesForDay(selected);
    elements.calendarDayEntries.replaceChildren(...(entries.length ? entries.map(item => {
      const row = mailNode("article", "calendar-day-entry");
      row.style.setProperty("--calendar-color", item.color);
      const info = item.event
        ? [item.label, item.event.showStart ? "Začátek hraní " + item.event.showStart : "", item.event.city, item.event.venue]
        : [item.label, item.entry.startDate !== item.entry.endDate
          ? formatEventDate(item.entry.startDate) + " – " + formatEventDate(item.entry.endDate) : "Celý den"];
      row.append(mailNode("strong", "", item.title), mailNode("small", "", info.filter(Boolean).join(" · ")));
      if (item.event || item.entry.userId === session.user.id) {
        const edit = rowButton(item.event ? "Otevřít koncert" : "Upravit zápis", "Upravit " + item.title,
          () => item.event ? openEventDialog(item.event.id) : openCalendarEntry(item.entry));
        edit.className = "quiet-button compact";
        row.append(edit);
      }
      return row;
    }) : [mailNode("p", "section-help", "Na tento den nejsou žádné zápisy.")]));
  }
  function openCalendarEntry(entry) {
    const form = elements.calendarEntryForm;
    form.reset();
    form.elements.entryId.value = entry?.id || "";
    form.elements.title.value = entry?.title || "";
    form.elements.startDate.value = formatEventDate(entry?.startDate || SetlisterPlanning.dateKey(bandCalendarDate));
    form.elements.endDate.value = entry?.endDate ? formatEventDate(entry.endDate) : "";
    elements.calendarEntryHeading.textContent = entry ? "Upravit vlastní zápis" : "Přidat vlastní zápis";
    elements.deleteCalendarEntry.hidden = !entry;
    elements.calendarEntryDialog.showModal();
  }
  function saveCalendarEntry(form) {
    const data = formPayload(form);
    const title = data.title.trim();
    const startDate = parseEventDate(data.startDate);
    const endDate = data.endDate.trim() ? parseEventDate(data.endDate) : startDate;
    if (!title || !startDate || !endDate || endDate < startDate || endDate === "9999-12-31") {
      showToast("Zadej název a platný rozsah data.");
      return;
    }
    const entries = workspace.state.calendarEntries;
    const existing = entries.find(entry => entry.id === data.entryId);
    if (existing && existing.userId !== session.user.id) return;
    if (!existing && entries.length >= 1000) { showToast("Kapela už má 1 000 zápisů."); return; }
    const entry = { id: existing?.id || uid("calendar"), userId: session.user.id, title, startDate, endDate };
    if (existing) Object.assign(existing, entry);
    else entries.push(entry);
    bandCalendarDate = SetlisterPlanning.dateFromKey(startDate);
    elements.calendarEntryDialog.close();
    changed();
  }
  function renderCalendarFeed(url) {
    elements.calendarFeedLinks.hidden = !url;
    elements.createCalendarFeed.hidden = Boolean(url);
    elements.calendarFeedUrl.value = url;
    if (url) elements.appleCalendarFeed.href = url.replace(/^https?:/, "webcal:");
    else elements.appleCalendarFeed.removeAttribute("href");
  }
  async function loadCalendarFeed() {
    const band = activeBandId;
    if (!band || calendarFeedBand === band) return;
    try {
      const result = await api("/calendar-feed?bandId=" + encodeURIComponent(band));
      if (activeBandId !== band) return;
      renderCalendarFeed(result.url || "");
      calendarFeedBand = band;
    } catch (error) { showStatus(elements.calendarFeedStatus, error.message); }
  }
  async function changeCalendarFeed(enabled) {
    const band = activeBandId;
    const button = enabled ? elements.createCalendarFeed : elements.revokeCalendarFeed;
    button.disabled = true;
    try {
      const result = await api("/calendar-feed", { method: "POST", body: JSON.stringify({ bandId: band, enabled }) });
      if (activeBandId !== band) return;
      renderCalendarFeed(result.url || "");
      calendarFeedBand = band;
      showStatus(elements.calendarFeedStatus, enabled ? "Odkaz je připravený." : "Odkaz k odběru je zrušený.", true);
    } catch (error) { showStatus(elements.calendarFeedStatus, error.message); }
    finally { button.disabled = false; }
  }
  function eventTimeline(event) {
    return [["Arrival", event.arrival], ["Load-in", event.loadIn], ["Zvukovka", event.soundcheck], ["Začátek hraní", event.showStart], ["Konec", event.showEnd]].filter(item => item[1]);
  }
  function elapsedClock(start, end) { if (!parseClock(start) || !parseClock(end)) return "—"; const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); let duration = minutes(end) - minutes(start); if (duration < 0) duration += 24 * 60; return formatTime(duration * 60); }
  function tasksForEvent(eventId) {
    return workspace.state.tasks.filter(task => task.eventId === eventId);
  }
  function addConcertTask(event, title, done = false) {
    const tasks = workspace.state.tasks;
    if (tasks.length >= 1000) {
      showToast("Kapela už má 1 000 úkolů.");
      return false;
    }
    if (tasksForEvent(event.id).some(task => normalizedText(task.title) === normalizedText(title))) {
      showToast("Takový úkol už k tomuto koncertu existuje.");
      return false;
    }
    tasks.push({
      id: uid("task"), eventId: event.id, title, done,
      category: "", deadline: "", assigneeUserId: "",
    });
    return true;
  }
  function renderEventChecklist(event) {
    const section = mailNode("section", "concert-checklist");
    section.id = "event-checklist-" + event.id;
    section.tabIndex = -1;
    const groups = mailNode("div", "concert-checklist-groups");
    groups.append(renderChecklistGroup(event, true), renderChecklistGroup(event, false));
    section.append(mailNode("h4", "", "Checklist koncertu"), groups);
    return section;
  }
  function renderChecklistGroup(event, isTask) {
    const group = mailNode("section", "checklist-group");
    const title = isTask ? "Organizace" : "Výbava";
    const items = isTask ? tasksForEvent(event.id) : event.checklist;
    group.append(mailNode("h5", "", title),
      mailNode("p", "section-help", items.length
        ? `${items.filter(item => item.done).length} / ${items.length} hotovo`
        : isTask ? "Položky se zobrazí také v Úkolech." : "Co si vezmete na koncert."));
    const list = mailNode("div", "event-checklist");
    for (const item of [...items].sort((a, b) => Number(a.done) - Number(b.done))) {
      const row = mailNode("div", "checklist-line");
      const label = mailNode("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `check-${event.id}-${item.id}`;
      input.checked = item.done;
      input.addEventListener("change", () => {
        item.done = input.checked;
        changed();
        document.getElementById(input.id)?.focus();
      });
      label.append(input, mailNode("span", "", isTask ? item.title : item.label));
      row.append(label);
      const action = isTask
        ? rowButton("Upravit", "Upravit v Úkolech", () => { showAppView("tasks"); editTask(item); })
        : rowButton("Do organizace", "Přesunout do organizace a Úkolů", () => {
            if (!addConcertTask(event, item.label, item.done)) return;
            event.checklist = event.checklist.filter(other => other.id !== item.id);
            changed();
            document.getElementById("event-checklist-" + event.id)?.focus();
          });
      action.className = "checklist-action";
      row.append(action);
      list.append(row);
    }
    group.append(list);
    if (isTask || items.length < 30) {
      const form = mailNode("form", "checklist-add");
      const input = document.createElement("input");
      input.id = `check-add-${isTask ? "task" : "gear"}-${event.id}`;
      input.required = true;
      input.maxLength = isTask ? 160 : 120;
      input.placeholder = isTask ? "Např. Ověřit příjezd" : "Např. Náhradní struny";
      input.setAttribute("aria-label", isTask ? "Nový úkol ke koncertu" : "Nová položka výbavy");
      const button = mailNode("button", "secondary-button compact", "Přidat");
      button.type = "submit";
      form.append(input, button);
      form.addEventListener("submit", submit => {
        submit.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        if (isTask) {
          if (!addConcertTask(event, value)) return;
        } else {
          if (items.some(item => normalizedText(item.label) === normalizedText(value))) {
            showToast("Tahle položka už ve výbavě je.");
            return;
          }
          items.push({ id: uid("check"), label: value, done: false });
        }
        changed();
        (document.getElementById(input.id) || document.getElementById("event-checklist-" + event.id))?.focus();
      });
      group.append(form);
    }
    return group;
  }
  function eventCard(event, history = false) {
    const card = document.createElement("article"); card.className = "event-card" + (history ? " history" : ""); card.id = "event-card-" + event.id; card.tabIndex = -1; const head = document.createElement("div"); head.className = "event-card-head"; const title = document.createElement("div"); const date = document.createElement("span"); date.textContent = formatEventDate(event.date); const heading = document.createElement("h3"); heading.textContent = event.name || [event.city, event.venue].filter(Boolean).join(" — "); const place = document.createElement("p"); place.textContent = [event.city, event.venue].filter(Boolean).join(" · "); title.append(date, heading, place); const actions = document.createElement("div"); const edit = rowButton("✎", "Upravit koncert", () => openEventDialog(event.id)); const remove = rowButton("×", "Odstranit koncert", () => { if (!window.confirm("Opravdu odstranit koncert „" + (event.name || event.venue) + "“?")) return; workspace.state.events = workspace.state.events.filter(item => item.id !== event.id); workspace.state.tasks.forEach(task => { if (task.eventId === event.id) delete task.eventId; }); changed(); }); actions.append(edit, remove); head.append(title, actions); card.append(head);
    const fee = event.feeAmount == null ? "" : new Intl.NumberFormat("cs-CZ", {
      style: "currency", currency: /^[A-Z]{3}$/.test(event.feeCurrency || "") ? event.feeCurrency : "CZK",
    }).format(event.feeAmount);
    const details = [event.contactName ? "Kontakt: " + event.contactName + (event.contactPhone ? " · " + event.contactPhone : "") : "", fee ? "Honorář: " + fee : "", event.note || ""].filter(Boolean); if (details.length) { const detail = document.createElement("div"); detail.className = "event-practical"; detail.replaceChildren(...details.map(text => { const line = document.createElement("p"); line.textContent = text; return line; })); card.append(detail); }
    const set = eventSetlist(event); if (set) { const setButton = document.createElement("button"); setButton.type = "button"; setButton.className = "event-setlist-link"; setButton.innerHTML = `<span>SETLIST</span><strong>${escapeText(set.name)}</strong><small>${set.songIds.length} skladeb →</small>`; setButton.addEventListener("click", () => loadSavedSetlist(set.id)); card.append(setButton); }
    else { const missing = document.createElement("p"); missing.className = "event-missing-set"; missing.textContent = "Bez přiřazeného setlistu"; card.append(missing); }
    if (history) {
      const planned = new Set(event.plannedSongIds?.length ? event.plannedSongIds : set?.songIds || []); const actual = event.playedSongIds || []; const skipped = [...planned].filter(id => !actual.includes(id)).length; const added = actual.filter(id => !planned.has(id)).length; const actualSeconds = actual.reduce((sum, id) => sum + Number(workspace.state.songs.find(song => song.id === id)?.seconds || 0), 0); const stats = document.createElement("div"); stats.className = "event-history-stats"; [["ODEHRÁNO", actual.length + " skladeb"], ["DÉLKA SKLADEB", formatTime(actualSeconds)], ["REÁLNÝ ČAS", elapsedClock(event.actualStart, event.actualEnd)], ["ZMĚNY", (skipped ? "−" + skipped : "0") + (added ? " / +" + added : "")], ["HODNOCENÍ", event.rating ? event.rating + " / 5" : "—"]].forEach(([label, value]) => { const item = document.createElement("div"); item.innerHTML = `<span>${label}</span><strong>${value}</strong>`; stats.append(item); }); card.append(stats); if (event.performanceNote) { const note = document.createElement("p"); note.className = "performance-note"; note.textContent = event.performanceNote; card.append(note); }
    } else {
      const timeline = document.createElement("div"); timeline.className = "event-mini-timeline"; eventTimeline(event).forEach(([label, value]) => { const item = document.createElement("span"); item.classList.toggle("concert-start", label === "Začátek hraní"); item.append(mailNode("small", "", label), mailNode("strong", "", value)); timeline.append(item); }); if (timeline.children.length) card.append(timeline);
      card.append(renderEventChecklist(event));
      if (set) {
        const button = rowButton("Otevřít plán zkoušky", "Naplánovat zkoušku pro " + set.name,
          () => openRehearsalForSet(set));
        button.className = "secondary-button compact";
        const songs = scopedRehearsalSongs("saved:" + set.id);
        const members = workspace.state.members;
        const ready = members.length ? songs.filter(song => members.every(member => song.readiness?.[member.id] === "ready")).length : 0;
        card.append(mailNode("p", "section-help", `Kapela má připraveno ${ready} z ${songs.length} skladeb.`), button);
      }
      const done = rowButton("Zapsat jako odehrané", "Zapsat jako odehrané", () => openEventDialog(event.id, true));
      done.className = "secondary-button compact";
      card.append(done);
    }
    return card;
  }
  function escapeText(value) { const span = document.createElement("span"); span.textContent = String(value || ""); return span.innerHTML; }
  function renderEvents() {
    if (!workspace) return; const planned = workspace.state.events.filter(event => event.status !== "completed").sort((a, b) => String(a.date).localeCompare(String(b.date))); const history = workspace.state.events.filter(event => event.status === "completed").sort((a, b) => String(b.date).localeCompare(String(a.date)));
    elements.upcomingEvents.replaceChildren(...(planned.length ? planned.map(event => eventCard(event)) : [Object.assign(document.createElement("p"), { className: "section-help", textContent: "Zatím není naplánovaný žádný koncert." })])); elements.eventHistory.replaceChildren(...(history.length ? history.map(event => eventCard(event, true)) : [Object.assign(document.createElement("p"), { className: "section-help", textContent: "Historie se začne plnit po prvním odehraném koncertu." })]));
    const next = planned[0]; if (!next) { elements.nextEventSpotlight.innerHTML = '<div><span>DALŠÍ KONCERT</span><h2>Ještě není naplánovaný</h2><p>Přidej termín, časy a hotový setlist.</p></div>'; return; }
    const set = eventSetlist(next); const timeline = eventTimeline(next); elements.nextEventSpotlight.replaceChildren(); const intro = document.createElement("div"); intro.innerHTML = `<span>DALŠÍ KONCERT · ${escapeText(formatEventDate(next.date, true))}</span><h2>${escapeText(next.name || next.venue)}</h2><p>${escapeText([next.city, next.venue, next.address].filter(Boolean).join(" · "))}</p>`; const times = document.createElement("div"); times.className = "event-spotlight-times"; timeline.forEach(([label, value]) => { const item = document.createElement("div"); item.classList.toggle("concert-start", label === "Začátek hraní"); item.append(mailNode("span", "", label), mailNode("strong", "", value)); times.append(item); }); const actions = document.createElement("div"); actions.className = "event-spotlight-actions"; if (set) { const open = document.createElement("button"); open.type = "button"; open.className = "primary-button"; open.textContent = "Otevřít setlist · " + set.name; open.addEventListener("click", () => loadSavedSetlist(set.id)); actions.append(open); } const edit = document.createElement("button"); edit.type = "button"; edit.className = "secondary-button"; edit.textContent = "Upravit den koncertu"; edit.addEventListener("click", () => openEventDialog(next.id)); actions.append(edit);
    const checklist = [...next.checklist, ...tasksForEvent(next.id)];
    const check = rowButton("Checklist · " + checklist.filter(item => item.done).length + "/" + checklist.length,
      "Přejít na checklist koncertu", () => {
        const panel = document.getElementById("event-checklist-" + next.id);
        panel?.focus({ preventScroll: true });
        panel?.scrollIntoView({ block: "center" });
      });
    check.className = "quiet-button compact";
    actions.append(check);
    elements.nextEventSpotlight.append(intro, times, actions);
  }
  function refreshEventSetlistOptions(preferred = "") { const value = preferred || elements.eventSetlist.value; elements.eventSetlist.replaceChildren(option("", "Bez přiřazeného setlistu"), ...workspace.state.savedSetlists.map(set => option(set.id, set.name))); elements.eventSetlist.value = workspace.state.savedSetlists.some(set => set.id === value) ? value : ""; enhanceSelect(elements.eventSetlist); }
  function renderEventPlayedSongs() {
    const used = new Set(eventPlayedSongDraft); elements.eventPlayedSongSelect.replaceChildren(option("", "Vyber skladbu"), ...workspace.state.songs.filter(song => !used.has(song.id)).map(song => option(song.id, song.title))); enhanceSelect(elements.eventPlayedSongSelect);
    elements.eventPlayedSongs.replaceChildren(...eventPlayedSongDraft.map((id, index) => { const song = workspace.state.songs.find(item => item.id === id); const row = document.createElement("li"); const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0"); const title = document.createElement("strong"); title.textContent = song?.title || "Odstraněná skladba"; const actions = document.createElement("div"); const up = rowButton("↑", "Posunout nahoru", () => { if (!index) return; [eventPlayedSongDraft[index - 1], eventPlayedSongDraft[index]] = [eventPlayedSongDraft[index], eventPlayedSongDraft[index - 1]]; renderEventPlayedSongs(); }); const down = rowButton("↓", "Posunout dolů", () => { if (index >= eventPlayedSongDraft.length - 1) return; [eventPlayedSongDraft[index + 1], eventPlayedSongDraft[index]] = [eventPlayedSongDraft[index], eventPlayedSongDraft[index + 1]]; renderEventPlayedSongs(); }); const remove = rowButton("×", "Odebrat", () => { eventPlayedSongDraft.splice(index, 1); renderEventPlayedSongs(); }); up.disabled = index === 0; down.disabled = index === eventPlayedSongDraft.length - 1; actions.append(up, down, remove); row.append(number, title, actions); return row; }));
  }
  function toggleEventHistoryFields() { const completed = elements.eventStatus.value === "completed"; elements.eventHistoryFields.hidden = !completed; if (completed && !eventPlayedSongDraft.length) eventPlayedSongDraft = [...(savedSetlistById(elements.eventSetlist.value)?.songIds || [])]; renderEventPlayedSongs(); }
  function openEventDialog(eventId = "", forceCompleted = false, selectedDate = "") {
    const event = workspace.state.events.find(item => item.id === eventId); const form = elements.eventForm; form.reset(); closeEventCalendar(); elements.eventDateInput.setCustomValidity(""); form.elements.eventId.value = event?.id || ""; form.elements.name.value = event?.name || ""; const eventDate = event?.date || selectedDate; form.elements.date.value = eventDate ? formatEventDate(eventDate) : ""; form.elements.feeAmount.value = event?.feeAmount ?? ""; form.elements.feeCurrency.value = event?.feeCurrency || "CZK"; enhanceSelect(form.elements.feeCurrency); ["city", "venue", "address", "arrival", "loadIn", "soundcheck", "showStart", "showEnd", "contactName", "contactPhone", "note", "actualStart", "actualEnd", "performanceNote"].forEach(key => { form.elements[key].value = event?.[key] || ""; }); form.elements.status.value = forceCompleted ? "completed" : event?.status || "planned"; form.elements.rating.value = String(event?.rating || 0); form.elements.checklist.value = (event?.checklist || []).map(item => item.label).join("\n"); refreshEventSetlistOptions(event?.setlistId || ""); eventPlayedSongDraft = [...(event?.playedSongIds || [])]; const matchingLiveSet = event?.setlistId && liveSession.liveSet?.setlistRef === "saved:" + event.setlistId ? liveSession.liveSet : null; if (forceCompleted && !eventPlayedSongDraft.length && matchingLiveSet?.playedSongIds?.length) eventPlayedSongDraft = [...matchingLiveSet.playedSongIds]; if ((forceCompleted || event?.status === "completed") && !eventPlayedSongDraft.length) eventPlayedSongDraft = [...(eventSetlist(event)?.songIds || [])]; elements.eventDialogTitle.textContent = event ? "Upravit koncert" : "Přidat koncert"; toggleEventHistoryFields(); enhanceSelect(elements.eventStatus); enhanceSelect(form.elements.rating); elements.eventDialog.showModal();
  }
  function saveEventForm(form) {
    const data = formPayload(form); const date = parseEventDate(data.date); if (!date) { elements.eventDateInput.setCustomValidity("Zadej platné datum nebo ho vyber v kalendáři."); elements.eventDateInput.reportValidity(); return; } const times = ["arrival", "loadIn", "soundcheck", "showStart", "showEnd", "actualStart", "actualEnd"]; for (const key of times) if (data[key] && !parseClock(data[key])) { showToast("Zkontroluj čas. Použij formát 16:30."); return; }
    const rawFee = data.feeAmount.trim().replace(/\s/g, "").replace(",", ".");
    const feeAmount = rawFee ? Number(rawFee) : null;
    if (rawFee && (!/^\d+(?:\.\d{1,2})?$/.test(rawFee) || feeAmount > 1000000000)) {
      showToast("Zadej platnou částku honoráře, například 12 000 nebo 350,50.");
      form.elements.feeAmount.focus();
      return;
    }
    const existing = workspace.state.events.find(item => item.id === data.eventId); const oldChecks = new Map((existing?.checklist || []).map(item => [normalizedText(item.label), item])); const checklist = [...new Set(String(data.checklist || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean))].slice(0, 30).map(label => ({ id: oldChecks.get(normalizedText(label))?.id || uid("check"), label: label.slice(0, 120), done: Boolean(oldChecks.get(normalizedText(label))?.done) })); const completed = data.status === "completed"; const plannedSongIds = completed ? (existing?.plannedSongIds?.length ? [...existing.plannedSongIds] : [...(savedSetlistById(data.setlistId)?.songIds || [])]) : (existing?.plannedSongIds || []); const payload = { id: existing?.id || uid("event"), name: data.name.trim(), date, city: data.city.trim(), venue: data.venue.trim(), address: data.address.trim(), feeAmount, feeCurrency: data.feeCurrency || "CZK", arrival: parseClock(data.arrival), loadIn: parseClock(data.loadIn), soundcheck: parseClock(data.soundcheck), showStart: parseClock(data.showStart), showEnd: parseClock(data.showEnd), setlistId: data.setlistId || "", contactName: data.contactName.trim(), contactPhone: data.contactPhone.trim(), note: data.note.trim(), checklist, status: completed ? "completed" : "planned", actualStart: parseClock(data.actualStart), actualEnd: parseClock(data.actualEnd), rating: Math.max(0, Math.min(5, Number(data.rating) || 0)), performanceNote: data.performanceNote.trim(), playedSongIds: completed ? [...eventPlayedSongDraft] : (existing?.playedSongIds || []), plannedSongIds };
    if (existing) Object.assign(existing, payload); else workspace.state.events.push(payload); elements.eventDialog.close(); changed(); showToast(existing ? "Koncert je upravený." : "Koncert je naplánovaný.");
  }
  function songTuning(song, memberId) { const detail = songMemberDetail(song, memberId); const field = normalizePrintFields(detail.printFields).find(item => ["ladeni", "tuning"].includes(normalizedText(item.label))); return normalizedText(field?.value || ""); }
  function transitionMetrics(first, second) {
    const result = { instruments: 0, capos: 0, tunings: 0, presets: 0, cost: 0 }; if (!first || !second) return result;
    workspace.state.members.forEach(member => { const a = songMemberDetail(first, member.id); const b = songMemberDetail(second, member.id); const ai = memberInstrument(member, a.instrumentId || member.defaultInstrumentId || "none"); const bi = memberInstrument(member, b.instrumentId || member.defaultInstrumentId || "none"); if (ai.id !== bi.id) { result.instruments += 1; result.cost += 5; } if (ai.id === bi.id && usesCapo(ai) && Number(a.capo || 0) !== Number(b.capo || 0)) { result.capos += 1; result.cost += 2.4; } const at = songTuning(first, member.id); const bt = songTuning(second, member.id); if (ai.id === bi.id && ai.kind !== "none" && at !== bt && (at || bt)) { result.tunings += 1; result.cost += 4; } if (ai.id === bi.id && ai.kind === "electric-guitar" && String(a.preset || "") !== String(b.preset || "")) { result.presets += 1; result.cost += .35; } }); return result;
  }
  function targetEnergy(index, count) {
    if (count <= 1) return 4; const position = index / (count - 1); const points = [[0, 4.4], [.24, 3.1], [.52, 4.2], [.72, 3.5], [1, 5]]; for (let i = 1; i < points.length; i += 1) if (position <= points[i][0]) { const [x1, y1] = points[i - 1]; const [x2, y2] = points[i]; return y1 + (y2 - y1) * ((position - x1) / (x2 - x1)); } return 5;
  }
  function rolePositionPenalty(song, index, count, roleCounts) {
    if (song.role === "opener") return index < roleCounts.opener ? index * 2 : 90 + index * 4;
    if (song.role === "encore") return index >= count - roleCounts.encore ? (count - 1 - index) * 2 : 90 + (count - index) * 4;
    if (song.role === "closer") { const start = count - roleCounts.encore - roleCounts.closer; const end = count - roleCounts.encore; return index >= start && index < end ? Math.abs(end - 1 - index) : 70 + Math.abs(start - index) * 3; }
    if (index < roleCounts.opener || index >= count - roleCounts.encore - roleCounts.closer) return 22; return 0;
  }
  function orderMetrics(ids) {
    const result = { instruments: 0, capos: 0, tunings: 0, presets: 0, energyFit: 0 }; const songs = ids.map(id => workspace.state.songs.find(song => song.id === id)).filter(Boolean); const previousInstrument = new Map(); const instrumentState = new Map();
    songs.forEach((song, index) => { result.energyFit += Math.abs(Number(song.energy) - targetEnergy(index, songs.length)); workspace.state.members.forEach(member => { const detail = songMemberDetail(song, member.id); const instrument = memberInstrument(member, detail.instrumentId || member.defaultInstrumentId || "none"); const previousId = previousInstrument.get(member.id); if (previousId !== undefined && previousId !== instrument.id) result.instruments += 1; previousInstrument.set(member.id, instrument.id); const key = member.id + "|" + instrument.id; const previous = instrumentState.get(key); const current = { capo: Number(detail.capo || 0), tuning: songTuning(song, member.id), preset: String(detail.preset || "") }; if (previous && usesCapo(instrument) && previous.capo !== current.capo) result.capos += 1; if (previous && instrument.kind !== "none" && previous.tuning !== current.tuning && (previous.tuning || current.tuning)) result.tunings += 1; if (previous && instrument.kind === "electric-guitar" && previous.preset !== current.preset) result.presets += 1; instrumentState.set(key, current); }); }); return result;
  }
  function orderScore(ids) {
    const songs = ids.map(id => workspace.state.songs.find(song => song.id === id)).filter(Boolean); const roleCounts = { opener: songs.filter(song => song.role === "opener").length, closer: songs.filter(song => song.role === "closer").length, encore: songs.filter(song => song.role === "encore").length }; const metrics = orderMetrics(ids); let score = metrics.instruments * 5 + metrics.capos * 2.4 + metrics.tunings * 4 + metrics.presets * .35; songs.forEach((song, index) => { score += Math.abs(Number(song.energy) - targetEnergy(index, songs.length)) * 1.55 + rolePositionPenalty(song, index, songs.length, roleCounts); if (index >= 2 && song.energy >= 5 && songs[index - 1].energy >= 5 && songs[index - 2].energy >= 5) score += 5; }); return score;
  }
  function buildSmartOrder() {
    const original = [...workspace.state.draft.songIds]; const locked = new Set(workspace.state.draft.lockedSongIds); const result = Array(original.length).fill(""); original.forEach((id, index) => { if (locked.has(id)) result[index] = id; }); let remaining = original.filter(id => !locked.has(id)); const allSongs = original.map(id => workspace.state.songs.find(song => song.id === id)).filter(Boolean); const roleCounts = { opener: allSongs.filter(song => song.role === "opener").length, closer: allSongs.filter(song => song.role === "closer").length, encore: allSongs.filter(song => song.role === "encore").length };
    for (let index = 0; index < result.length; index += 1) { if (result[index]) continue; const previousId = result[index - 1]; const previous = workspace.state.songs.find(song => song.id === previousId); remaining.sort((aId, bId) => { const a = workspace.state.songs.find(song => song.id === aId); const b = workspace.state.songs.find(song => song.id === bId); const cost = song => (previous ? transitionMetrics(previous, song).cost : 0) + Math.abs(song.energy - targetEnergy(index, result.length)) * 1.55 + rolePositionPenalty(song, index, result.length, roleCounts); return cost(a) - cost(b) || original.indexOf(aId) - original.indexOf(bId); }); result[index] = remaining.shift(); }
    const unlocked = result.map((id, index) => locked.has(id) ? -1 : index).filter(index => index >= 0); const maxPasses = unlocked.length > 60 ? 0 : unlocked.length > 40 ? 2 : 5; let bestScore = orderScore(result); for (let pass = 0; pass < maxPasses; pass += 1) { let improved = false; for (let a = 0; a < unlocked.length - 1; a += 1) for (let b = a + 1; b < unlocked.length; b += 1) { const candidate = [...result]; [candidate[unlocked[a]], candidate[unlocked[b]]] = [candidate[unlocked[b]], candidate[unlocked[a]]]; const score = orderScore(candidate); if (score + .01 < bestScore) { result.splice(0, result.length, ...candidate); bestScore = score; improved = true; } } if (!improved) break; }
    return result;
  }
  function openSmartOrderDialog() {
    const original = workspace.state.draft.songIds; if (original.length < 3) { showToast("Pro chytré řazení přidej alespoň tři skladby."); return; } smartOrderDraft = buildSmartOrder(); const before = orderMetrics(original); const after = orderMetrics(smartOrderDraft); const saved = { instruments: before.instruments - after.instruments, capos: before.capos - after.capos, tunings: before.tunings - after.tunings }; const parts = [saved.instruments > 0 ? "o " + saved.instruments + " méně změn nástroje" : "změny nástrojů bez zhoršení", saved.capos > 0 ? "o " + saved.capos + " méně změn kapa" : "kapa bez zhoršení", saved.tunings > 0 ? "o " + saved.tunings + " méně změn ladění" : "ladění bez zhoršení", workspace.state.draft.lockedSongIds.length ? workspace.state.draft.lockedSongIds.length + " zamčených pozic zachováno" : "žádná zamčená pozice"]; elements.smartOrderSummary.replaceChildren(...parts.map(text => { const item = document.createElement("span"); item.textContent = text; return item; })); elements.smartOrderPreview.replaceChildren(...smartOrderDraft.map((id, index) => { const song = workspace.state.songs.find(item => item.id === id); const row = document.createElement("li"); row.classList.toggle("locked", workspace.state.draft.lockedSongIds.includes(id)); const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0"); const title = document.createElement("strong"); title.textContent = song.title; const reason = document.createElement("small"); reason.textContent = [song.role !== "standard" ? ROLE_LABELS[song.role] : "", "Energie " + song.energy, workspace.state.draft.lockedSongIds.includes(id) ? "zamčená pozice" : ""].filter(Boolean).join(" · "); row.append(number, title, reason); return row; })); elements.smartOrderDialog.showModal();
  }
  function liveMember() { return memberById(signedInMemberId()) || workspace?.state.members[0] || null; }
  function isLiveLeader() { return Boolean(liveSession.liveSet?.active && liveSession.liveSet.leaderUserId === session?.user?.id); }
  function renderLiveSetup() {
    if (!workspace) return; const current = elements.liveSetSelect.value || "draft"; const options = [option("draft", "Aktuální set — " + workspace.state.draft.name), ...workspace.state.savedSetlists.map(set => option("saved:" + set.id, set.name))]; elements.liveSetSelect.replaceChildren(...options); elements.liveSetSelect.value = options.some(item => item.value === current) ? current : "draft"; elements.liveMemberName.textContent = liveMember()?.name || "Bez přiřazeného člena";
    const shared = liveSession.liveSet || {}; elements.liveLeaderState.textContent = shared.active ? (isLiveLeader() ? "Vedeš společný set · " + shared.setlistName : "Set vede " + (shared.leaderName || "člen kapely") + " · " + shared.setlistName) : "Nikdo právě nevede set."; elements.startLiveSet.textContent = shared.active && !isLiveLeader() ? "Převzít vedení" : "Spustit jako vedoucí"; elements.stopLiveSet.hidden = !isLiveLeader();
    if (!elements.liveStage.hidden) renderLiveSong();
  }
  async function startLiveSet() {
    const source = elements.liveSetSelect.value; const songIds = source === "draft" ? workspace.state.draft.songIds : (workspace.state.savedSetlists.find(set => "saved:" + set.id === source)?.songIds || []); if (!songIds.length) { showToast("Vybraný setlist neobsahuje žádné skladby."); return; }
    try { const started = Date.now(); const payload = await api("/live-session", { method: "POST", body: JSON.stringify({ bandId: activeBandId, action: "start_set", setlistRef: source }) }); applyLiveSession(payload, started, Date.now()); startLivePolling(); requestLiveWakeLock(); showToast("Teď vedeš set na všech připojených zařízeních."); } catch (error) { showToast(error.message); }
  }
  async function stopLiveSet() { try { const payload = await api("/live-session", { method: "POST", body: JSON.stringify({ bandId: activeBandId, action: "stop_set" }) }); applyLiveSession(payload); showToast("Společný set je ukončený."); } catch (error) { showToast(error.message); } }
  async function requestLiveWakeLock() { if (!navigator.wakeLock || document.visibilityState !== "visible") return; try { liveWakeLock = await navigator.wakeLock.request("screen"); } catch (_) {} }
  function renderLiveSong() {
    const songsById = new Map(workspace.state.songs.map(song => [song.id, song]));
    const songs = liveSongIds.map(id => songsById.get(id));
    const song = songs[liveSongIndex]; if (!song) { elements.liveStage.hidden = true; elements.liveEmpty.hidden = false; return; }
    const member = liveMember(); const detail = member ? songMemberDetail(song, member.id) : {}; const instrument = member ? memberInstrument(member, detail.instrumentId || member.defaultInstrumentId || "none") : null;
    const cue = SetlisterPlanning.tuningPlan(songs, member, memberInstrument)[liveSongIndex];
    elements.liveTuning.hidden = !cue;
    elements.liveTuning.textContent = cue ? "Ladění · " + cue : "";
    elements.livePosition.textContent = (liveSongIndex + 1) + " / " + liveSongIds.length; elements.livePositionProgress.style.width = ((liveSongIndex + 1) / liveSongIds.length * 100) + "%"; elements.liveSongRole.textContent = song.role !== "standard" ? ROLE_LABELS[song.role] : song.album || "Skladba"; elements.liveSongTitle.textContent = detail.customTitle || song.title;
    const meta = [formatTime(song.seconds), song.bpm ? song.bpm + " BPM" : "BPM nezadané", "Energie " + song.energy]; elements.liveSongMeta.replaceChildren(...meta.map(text => { const span = document.createElement("span"); span.textContent = text; return span; }));
    const instructions = []; if (instrument && instrument.kind !== "none") instructions.push({ label: "Nástroj", value: instrument.name }); if (instrument && usesCapo(instrument) && Number(detail.capo)) instructions.push({ label: "Kapo", value: "K" + detail.capo }); if (instrument?.kind === "electric-guitar" && detail.preset) instructions.push({ label: "Preset", value: detail.preset }); normalizePrintFields(song.printFields).filter(field => field.value).forEach(field => instructions.push({ label: field.label || "Pokyn pro všechny", value: field.value })); normalizePrintFields(detail.printFields).filter(field => field.value).forEach(field => instructions.push({ label: field.label || "Můj pokyn", value: field.value })); if (detail.note) instructions.push({ label: "Poznámka", value: detail.note });
    elements.liveInstructions.replaceChildren(...instructions.map(item => { const row = document.createElement("div"); const label = document.createElement("span"); label.textContent = item.label; const value = document.createElement("strong"); value.textContent = item.value; row.append(label, value); return row; })); if (!instructions.length) { const empty = document.createElement("p"); empty.textContent = "K této skladbě nemáš žádné osobní pokyny."; elements.liveInstructions.append(empty); }
    elements.livePrevious.disabled = !isLiveLeader() || liveSongIndex === 0; elements.liveNext.disabled = !isLiveLeader() || liveSongIndex === liveSongIds.length - 1; if (song.bpm) elements.liveBpm.value = String(song.bpm);
  }
  async function moveLiveSong(direction) { const next = Math.max(0, Math.min(liveSongIds.length - 1, liveSongIndex + direction)); if (next === liveSongIndex) return; if (!isLiveLeader()) { showToast("Pořadí právě ovládá " + (liveSession.liveSet?.leaderName || "vedoucí setu") + "."); return; } try { const payload = await api("/live-session", { method: "POST", body: JSON.stringify({ bandId: activeBandId, action: "set_song", songIndex: next }) }); applyLiveSession(payload); } catch (error) { showToast(error.message); } }
  async function enableLiveAudio() {
    const AudioEngine = window.AudioContext || window.webkitAudioContext; if (!AudioEngine) throw new Error("Tento prohlížeč nepodporuje Web Audio."); liveAudioContext = liveAudioContext || new AudioEngine({ latencyHint: "interactive" }); await liveAudioContext.resume(); const oscillator = liveAudioContext.createOscillator(); const gain = liveAudioContext.createGain(); gain.gain.value = 0; oscillator.connect(gain).connect(liveAudioContext.destination); oscillator.start(); oscillator.stop(liveAudioContext.currentTime + .01); elements.enableLiveAudio.textContent = "Zvuk povolen"; elements.enableLiveAudio.classList.add("ready"); return liveAudioContext;
  }
  function playLiveClick(when, accent) {
    if (!liveAudioContext || liveAudioContext.state !== "running") return; const oscillator = liveAudioContext.createOscillator(); const gain = liveAudioContext.createGain(); oscillator.frequency.value = accent ? 1700 : 1050; gain.gain.setValueAtTime(accent ? .32 : .2, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .045); oscillator.connect(gain).connect(liveAudioContext.destination); oscillator.start(when); oscillator.stop(when + .05);
  }
  function updateBeatDots(beat) { Array.from(elements.liveBeatDots.children).forEach((dot, index) => dot.classList.toggle("active", index === beat % 4)); }
  function scheduleLiveMetronome() {
    if (liveSession.status !== "running" || !liveSession.startedAtMs) { updateBeatDots(-1); return; } const nowServer = Date.now() + liveServerOffset; const interval = 60000 / liveSession.bpm; if (nowServer >= liveSession.startedAtMs) updateBeatDots(Math.floor((nowServer - liveSession.startedAtMs) / interval)); else updateBeatDots(-1); if (!liveAudioContext || liveAudioContext.state !== "running") return;
    const firstCandidate = Math.max(0, Math.floor((nowServer - liveSession.startedAtMs) / interval)); let beat = Math.max(liveLastScheduledBeat + 1, firstCandidate); const horizon = nowServer + 180; const calibration = Math.max(-250, Math.min(250, Number(elements.liveCalibration.value) || 0));
    while (liveSession.startedAtMs + beat * interval <= horizon) { const serverBeat = liveSession.startedAtMs + beat * interval; const localWall = serverBeat - liveServerOffset - calibration; const delay = (localWall - Date.now()) / 1000; if (delay >= -.03) playLiveClick(liveAudioContext.currentTime + Math.max(.006, delay), beat % 4 === 0); liveLastScheduledBeat = beat; beat += 1; }
  }
  function applyLiveSession(payload, requestStarted = Date.now(), requestFinished = Date.now()) {
    const rtt = requestFinished - requestStarted; const measuredOffset = Number(payload.serverTimeMs) - (requestStarted + requestFinished) / 2; if (rtt <= liveBestRtt + 5) { liveBestRtt = Math.min(liveBestRtt, rtt); liveServerOffset = measuredOffset; }
    if (payload.revision !== liveSessionRevision || payload.state.startedAtMs !== liveSession.startedAtMs) liveLastScheduledBeat = -1; liveSessionRevision = payload.revision; liveSession = payload.state; liveSession.liveSet = liveSession.liveSet || { active: false, songIds: [], songIndex: 0, leaderUserId: "", leaderName: "", setlistName: "" }; elements.liveSyncState.textContent = liveSession.status === "running" ? liveSession.bpm + " BPM · spustil/a " + (liveSession.leaderName || "člen kapely") : "Metronom je zastavený"; elements.liveMetronomeNote.textContent = liveSession.status === "running" ? (liveAudioContext?.state === "running" ? "Zařízení je připojené ke společnému kliku." : "Klik běží. Na tomto zařízení ještě povol zvuk.") : "Pro synchronizaci otevři sekci Zkouška na všech zařízeních."; if (liveSession.status === "running") elements.liveBpm.value = String(liveSession.bpm);
    if (liveSession.liveSet.active && liveSession.liveSet.songIds?.length) { liveSongIds = liveSession.liveSet.songIds.filter(id => workspace.state.songs.some(song => song.id === id)); liveSongIndex = Math.max(0, Math.min(liveSongIds.length - 1, Number(liveSession.liveSet.songIndex) || 0)); elements.liveEmpty.hidden = true; elements.liveStage.hidden = false; renderLiveSong(); requestLiveWakeLock(); } else if (liveSongIds.length) { liveSongIds = []; liveSongIndex = 0; elements.liveStage.hidden = true; elements.liveEmpty.hidden = false; }
    renderLiveSetup();
  }
  async function pollLiveSession() { if (!workspace || !activeBandId) return; const started = Date.now(); try { const payload = await api("/live-session?bandId=" + encodeURIComponent(activeBandId)); applyLiveSession(payload, started, Date.now()); } catch (_) {} }
  function startLivePolling() { if (!livePollTimer) livePollTimer = setInterval(pollLiveSession, 1000); if (!liveSchedulerTimer) liveSchedulerTimer = setInterval(scheduleLiveMetronome, 25); pollLiveSession(); }
  async function setSharedMetronome(action) {
    try { if (action === "start") await enableLiveAudio(); const bpm = Math.max(30, Math.min(300, Number(elements.liveBpm.value) || 120)); const started = Date.now(); const payload = await api("/live-session", { method: "POST", body: JSON.stringify({ bandId: activeBandId, action, bpm }) }); applyLiveSession(payload, started, Date.now()); showToast(action === "start" ? "Společný klik odstartuje za 2 sekundy." : "Společný klik je zastavený."); startLivePolling(); } catch (error) { showToast(error.message); }
  }
  function renderBandDialog() {
    if (!session) return; elements.bandList.replaceChildren(...session.bands.map(band => {
      const button = document.createElement("button"); button.type = "button"; button.classList.toggle("active", band.id === activeBandId); const name = document.createElement("strong"); name.textContent = band.name; const role = document.createElement("small"); role.textContent = band.role === "owner" ? "Vlastník" : "Člen"; button.append(name, role); button.addEventListener("click", () => { activeBandId = band.id; localStorage.setItem(ACTIVE_BAND_KEY, band.id); elements.bandDialog.close(); loadWorkspace(); }); return button;
    }));
  }
  function changed() { renderWorkspace(); elements.saveState.textContent = "Ukládám…"; clearTimeout(saveTimer); saveTimer = setTimeout(saveWorkspace, 450); }
  async function saveWorkspace() {
    if (!workspace || workspace.band.id !== activeBandId) return false;
    const band = activeBandId;
    try {
      const result = await api("/band-state", { method: "PUT", body: JSON.stringify({ bandId: band, revision, state: workspace.state }) });
      if (band !== activeBandId) return false;
      revision = result.revision;
      elements.saveState.textContent = "Uloženo";
      return true;
    } catch (error) {
      if (band !== activeBandId) return false;
      elements.saveState.textContent = "Neuloženo";
      if (error.message.includes("Konflikt")) await loadWorkspace();
      showToast(error.message);
      return false;
    }
  }
  function printFieldDraft(kind) { return kind === "song" ? songPrintFieldDraft : notesPrintFieldDraft; }
  function renderPrintFieldEditor(kind, focusLast = false) {
    const draft = printFieldDraft(kind); const container = kind === "song" ? elements.songPrintFields : elements.notesPrintFields;
    container.replaceChildren(...draft.map((field, index) => {
      const row = document.createElement("div"); row.className = "custom-field-row"; const label = document.createElement("label"); const title = document.createElement("span"); title.textContent = field.label || "Štítek"; const input = document.createElement("input"); input.type = "text"; input.maxLength = 64; input.placeholder = "Zadej hodnotu"; input.value = field.value || ""; input.addEventListener("input", () => { field.value = input.value.slice(0, 64); }); label.append(title, input); const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.title = "Odstranit pole " + (field.label || "Štítek"); remove.setAttribute("aria-label", remove.title); remove.addEventListener("click", () => { draft.splice(index, 1); renderPrintFieldEditor(kind); }); row.append(label, remove); return row;
    }));
    if (focusLast) container.lastElementChild?.querySelector("input")?.focus();
  }
  function addPrintField(kind) {
    const draft = printFieldDraft(kind); const input = kind === "song" ? elements.songNewFieldLabel : elements.notesNewFieldLabel; const label = input.value.trim().slice(0, 32); if (!label) return;
    if (draft.length >= 8) { showToast("Ke skladbě lze přidat nejvýše 8 vlastních polí."); return; }
    if (draft.some(field => normalizedText(field.label) === normalizedText(label))) { showToast("Pole s tímto názvem už existuje."); return; }
    draft.push({ id: uid("field"), label, value: "" }); input.value = ""; renderPrintFieldEditor(kind, true);
  }
  function openSongDialog(songId) {
    const song = workspace.state.songs.find(item => item.id === songId); if (!song) return;
    const form = elements.songEditForm; form.elements.songId.value = song.id; form.elements.title.value = song.title; form.elements.album.value = song.album || ""; form.elements.duration.value = formatTime(song.seconds); form.elements.bpm.value = song.bpm || ""; form.elements.energy.value = String(song.energy); form.elements.role.value = song.role || "standard"; songPrintFieldDraft = normalizePrintFields(song.printFields, song.printTags).map(field => ({ ...field })); elements.songNewFieldLabel.value = ""; renderPrintFieldEditor("song"); elements.songDialogTitle.textContent = song.title;
    enhanceSelects(form); elements.songDialog.showModal();
  }
  function openNotesDialog(songId, requestedMemberId = "") {
    const song = workspace.state.songs.find(item => item.id === songId); if (!song) return;
    if (!workspace.state.members.length) { showToast("Nejdřív přidej člena kapely v sekci Kapela a účet."); return; }
    const preferred = requestedMemberId || signedInMemberId() || (workspace.state.draft.viewerMemberId !== "clean" ? workspace.state.draft.viewerMemberId : "") || workspace.state.members[0].id;
    elements.notesForm.elements.songId.value = song.id; elements.notesDialogTitle.textContent = song.title; elements.notesMemberSelect.replaceChildren(...workspace.state.members.map(member => option(member.id, member.name))); elements.notesMemberSelect.value = workspace.state.members.some(member => member.id === preferred) ? preferred : workspace.state.members[0].id;
    populateNotesForm(); enhanceSelect(elements.notesMemberSelect); elements.notesDialog.showModal();
  }
  function populateNotesForm() {
    const song = workspace.state.songs.find(item => item.id === elements.notesForm.elements.songId.value); const member = memberById(elements.notesMemberSelect.value); if (!song || !member) return;
    const detail = songMemberDetail(song, member.id); const defaultInstrument = memberInstrument(member, member.defaultInstrumentId || "none"); elements.notesCustomTitle.value = detail.customTitle || ""; elements.notesInstrument.replaceChildren(option("", "Výchozí — " + defaultInstrument.name), option("none", "Bez nástroje"), ...member.instruments.filter(item => item.id !== "none").map(item => option(item.id, item.name))); elements.notesInstrument.value = detail.instrumentId || "";
    elements.notesCapo.replaceChildren(...Array.from({ length: 13 }, (_, index) => option(String(index), "K" + index))); elements.notesCapo.value = String(Number(detail.capo) || 0); elements.notesManualTuning.checked = detail.manualTuning === true; elements.notesPreset.value = detail.preset || ""; notesPrintFieldDraft = normalizePrintFields(detail.printFields, detail.printTags).map(field => ({ ...field })); elements.notesNewFieldLabel.value = ""; renderPrintFieldEditor("notes"); elements.notesText.value = detail.note || ""; updateNotesConditionalFields(); enhanceSelect(elements.notesInstrument); enhanceSelect(elements.notesCapo);
  }
  function updateNotesConditionalFields() {
    const member = memberById(elements.notesMemberSelect.value);
    const instrument = memberInstrument(member, elements.notesInstrument.value || member?.defaultInstrumentId);
    const capoSupported = usesCapo(instrument);
    elements.notesCapoLabel.hidden = !capoSupported;
    elements.notesManualTuningLabel.hidden = !capoSupported;
    elements.notesPresetLabel.hidden = instrument.kind !== "electric-guitar";
    if (!capoSupported) {
      elements.notesCapo.value = "0";
      elements.notesManualTuning.checked = false;
      enhanceSelect(elements.notesCapo);
    }
    if (instrument.kind !== "electric-guitar") elements.notesPreset.value = "";
  }
  function saveNotesForm(form) {
    const song = workspace.state.songs.find(item => item.id === form.elements.songId.value); const member = memberById(elements.notesMemberSelect.value); if (!song || !member) return;
    const instrument = memberInstrument(member, elements.notesInstrument.value || member.defaultInstrumentId); song.memberDetails = song.memberDetails || {}; song.memberDetails[member.id] = { customTitle: elements.notesCustomTitle.value.trim(), instrumentId: elements.notesInstrument.value, capo: usesCapo(instrument) ? Number(elements.notesCapo.value || 0) : 0, manualTuning: usesCapo(instrument) && elements.notesManualTuning.checked, preset: instrument.kind === "electric-guitar" ? elements.notesPreset.value.trim() : "", printFields: normalizePrintFields(notesPrintFieldDraft), note: elements.notesText.value.trim() };
    elements.notesDialog.close(); changed(); showToast("Osobní pokyny pro " + member.name + " jsou uložené.");
  }
  function openMemberDialog(memberId = "") {
    const member = memberId ? memberById(memberId) : null; const form = elements.memberForm; form.reset(); form.elements.memberId.value = member?.id || ""; form.elements.name.value = member?.name || ""; form.elements.vocals.checked = Boolean(member?.vocals); elements.memberDialogTitle.textContent = member ? "Upravit " + member.name : "Přidat člena";
    const assignedAccountIds = new Set(workspace.state.members.filter(item => item.id !== member?.id && item.linkedUserId).map(item => item.linkedUserId)); const availableAccounts = (workspace.members || []).filter(account => !assignedAccountIds.has(account.id)); elements.linkedUserSelect.replaceChildren(option("", "Bez propojeného účtu"), ...availableAccounts.map(account => option(account.id, account.email + " — " + account.name))); elements.linkedUserSelect.value = availableAccounts.some(account => account.id === member?.linkedUserId) ? member.linkedUserId : ""; enhanceSelect(elements.linkedUserSelect);
    memberDraftCustomInstruments = (member?.instruments || []).filter(item => item.kind === "custom").map(item => ({ ...item })); memberDraftSelectedIds = new Set((member?.instruments || []).map(item => item.id)); elements.defaultInstrumentSelect.dataset.preferred = member?.defaultInstrumentId || "none"; elements.customInstrumentInput.value = ""; renderMemberInstrumentChoices(); elements.memberDialog.showModal();
  }
  function updateDefaultInstrumentOptions() {
    const select = elements.defaultInstrumentSelect; const current = select.dataset.preferred || select.value || "none"; const selected = [...INSTRUMENTS, ...memberDraftCustomInstruments].filter(item => item.id !== "none" && memberDraftSelectedIds.has(item.id));
    select.replaceChildren(option("none", "Bez nástroje"), ...selected.map(item => option(item.id, item.name))); select.value = selected.some(item => item.id === current) ? current : "none"; select.dataset.preferred = select.value; enhanceSelect(select);
  }
  function renderMemberInstrumentChoices() {
    const instruments = [...INSTRUMENTS, ...memberDraftCustomInstruments]; elements.instrumentChoices.replaceChildren(...instruments.map(instrument => {
      const wrapper = document.createElement("div"); wrapper.className = "instrument-choice-wrap"; const label = document.createElement("label"); label.className = "instrument-option"; const input = document.createElement("input"); input.type = "checkbox"; input.value = instrument.id; input.checked = memberDraftSelectedIds.has(instrument.id); input.addEventListener("change", () => { if (input.checked) memberDraftSelectedIds.add(instrument.id); else memberDraftSelectedIds.delete(instrument.id); updateDefaultInstrumentOptions(); }); const marker = document.createElement("i"); const name = document.createElement("span"); name.textContent = instrument.name; label.append(input, marker, name); wrapper.append(label);
      if (instrument.kind === "custom") {
        wrapper.classList.add("custom-instrument-choice");
        const capo = rowButton("Kapo", "Používá kapodastr: " + instrument.name, () => {
          instrument.usesCapo = !instrument.usesCapo;
          capo.setAttribute("aria-pressed", String(instrument.usesCapo));
        });
        capo.className = "instrument-capo-toggle";
        capo.setAttribute("aria-label", capo.title);
        capo.setAttribute("aria-pressed", String(usesCapo(instrument)));
        wrapper.append(capo);
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-custom-instrument"; remove.textContent = "×"; remove.title = "Odstranit " + instrument.name; remove.setAttribute("aria-label", "Odstranit vlastní nástroj " + instrument.name); remove.addEventListener("click", () => { memberDraftSelectedIds.delete(instrument.id); memberDraftCustomInstruments = memberDraftCustomInstruments.filter(item => item.id !== instrument.id); renderMemberInstrumentChoices(); }); wrapper.append(remove); }
      return wrapper;
    })); updateDefaultInstrumentOptions();
  }
  function addDraftCustomInstrument() {
    const name = elements.customInstrumentInput.value.trim(); if (!name) return; const all = [...INSTRUMENTS, ...memberDraftCustomInstruments]; const existing = all.find(item => item.name.toLocaleLowerCase("cs") === name.toLocaleLowerCase("cs"));
    if (existing) memberDraftSelectedIds.add(existing.id); else { const instrument = { id: uid("custom"), name, kind: "custom" }; memberDraftCustomInstruments.push(instrument); memberDraftSelectedIds.add(instrument.id); }
    elements.customInstrumentInput.value = ""; renderMemberInstrumentChoices(); elements.customInstrumentInput.focus();
  }
  function saveMemberForm(form) {
    const payload = formPayload(form); const all = [...INSTRUMENTS, ...memberDraftCustomInstruments]; const checked = all.filter(item => memberDraftSelectedIds.has(item.id));
    const existing = payload.memberId ? memberById(payload.memberId) : null; const linkedUserId = payload.linkedUserId || ""; const duplicate = workspace.state.members.find(item => item.id !== existing?.id && item.linkedUserId === linkedUserId && linkedUserId); if (duplicate) { showToast("Tento e-mail už používá člen " + duplicate.name + "."); return; } if (linkedUserId && !accountById(linkedUserId)) { showToast("Vybraný účet už do kapely nepatří."); return; } const member = existing || { id: uid("member"), linkedUserId: "" }; member.name = payload.name.trim(); member.linkedUserId = linkedUserId; member.instruments = checked.map(item => ({ ...item })); member.defaultInstrumentId = member.instruments.some(item => item.id === payload.defaultInstrumentId) ? payload.defaultInstrumentId : "none"; member.vocals = form.elements.vocals.checked;
    const validInstrumentIds = new Set(["", "none", ...member.instruments.map(item => item.id)]); workspace.state.songs.forEach(song => { const detail = song.memberDetails?.[member.id]; if (detail && !validInstrumentIds.has(detail.instrumentId || "")) { detail.instrumentId = "none"; detail.capo = 0; detail.manualTuning = false; detail.preset = ""; } });
    if (!existing) workspace.state.members.push(member); elements.memberDialog.close(); changed();
  }
  function saveSongForm(form) {
    const payload = formPayload(form); const song = workspace.state.songs.find(item => item.id === payload.songId); const seconds = parseDuration(payload.duration); if (!song || seconds < 1 || seconds > 3600) { showToast("Délku zadej jako 3:30 nebo počet sekund."); return; }
    const bpm = Number(payload.bpm || 0); if (!Number.isFinite(bpm) || bpm < 0 || bpm > 300) { showToast("BPM musí být mezi 1 a 300."); return; }
    song.title = payload.title.trim(); song.album = payload.album.trim(); song.seconds = seconds; song.bpm = bpm; song.energy = Number(payload.energy); song.role = payload.role; song.printFields = normalizePrintFields(songPrintFieldDraft); delete song.printTags; song.memberDetails = song.memberDetails || {};
    elements.songDialog.close(); changed();
  }
  function updateExportSummary() {
    const form = elements.exportForm; const memberPages = form.elements.memberPages.checked ? workspace.state.members.length * Math.max(1, Number(form.elements.memberCopies.value) || 1) : 0; const cleanPages = form.elements.cleanPages.checked ? Math.max(0, Number(form.elements.cleanCopies.value) || 0) : 0; elements.exportSummary.textContent = "Připraveno přibližně " + (memberPages + cleanPages) + " výtisků. V tiskovém dialogu lze zvolit tiskárnu nebo Uložit jako PDF.";
  }
  function buildPrintPage(member, onePage, clean = false) {
    const draft = workspace.state.draft;
    const entries = setlistEntries(draft);
    const songsById = new Map(workspace.state.songs.map(song => [song.id, song]));
    const tuning = SetlisterPlanning.tuningPlan(draft.songIds.map(id => songsById.get(id)), member, memberInstrument);
    const page = document.createElement("section");
    page.className = "print-page" + (onePage ? " one-page" : " flow-page");
    const header = document.createElement("header"); const logo = bandLogo(); if (logo) { const img = document.createElement("img"); img.src = logo; img.alt = ""; header.append(img); } const headerText = document.createElement("div"); const name = document.createElement("strong"); name.textContent = workspace.state.draft.name; const owner = document.createElement("span"); owner.textContent = clean ? "Čistý setlist" : member.name; headerText.append(name, owner); header.append(headerText); page.append(header);
    const list = document.createElement("ol"); list.className = "print-set"; let previousInstrument = member ? member.defaultInstrumentId || "none" : "none"; let lineWeight = 0;
    let songIndex = 0;
    entries.forEach(entry => {
      if (entry.kind === "interlude") {
        const text = entry.seconds ? entry.title + " · " + formatTime(entry.seconds) : entry.title;
        const item = mailNode("li", "print-interlude");
        item.append(mailNode("strong", "", text));
        list.append(item);
        lineWeight += .75;
        return;
      }
      const song = songsById.get(entry.id);
      const cue = tuning[songIndex++];
      const detail = member ? songMemberDetail(song, member.id) : {}; const instrument = member ? memberInstrument(member, detail.instrumentId || member.defaultInstrumentId || "none") : null; const instrumentChanged = member && instrument.id !== previousInstrument; const item = document.createElement("li");
      const left = document.createElement("span"); left.className = "print-left"; const printTags = [];
      if (member && usesCapo(instrument) && Number(detail.capo)) printTags.push("K" + detail.capo); if (member) printTags.push(...printFieldTexts(detail.printFields), ...printFieldTexts(song.printFields)); if (member && song.bpm) printTags.push(song.bpm + " BPM"); printTags.forEach(text => { const tag = document.createElement("i"); tag.textContent = text; left.append(tag); });
      const title = document.createElement("strong"); title.textContent = clean ? song.title : detail.customTitle || song.title;
      const right = document.createElement("span"); right.className = "print-right"; const instructions = [];
      if (instrumentChanged) instructions.push("→ " + instrument.name); if (instrument?.kind === "electric-guitar" && detail.preset) instructions.push(detail.preset); if (detail.note) instructions.push(detail.note); right.textContent = clean ? "" : instructions.join(" · ");
      const wrappedTagWeight = printTags.reduce((sum, text) => sum + Math.max(0, Math.ceil(text.length / 28) - 1) * .16, 0); if (cue) {
        item.append(mailNode("span", "print-tuning", "Ladění · " + cue));
        lineWeight += .65;
      }
      item.append(left, title, right); list.append(item); lineWeight += 1 + (right.textContent.length > 45 ? .45 : 0) + Math.max(0, printTags.length - 1) * .12 + wrappedTagWeight; previousInstrument = instrument?.id || previousInstrument;
    });
    const maxFont = clean ? 44 : 34; const minFont = clean ? 15 : 13; const estimated = Math.floor((clean ? 580 : 540) / Math.max(1, lineWeight)); page.style.setProperty("--print-size", (onePage ? Math.max(minFont, Math.min(maxFont, estimated)) : (clean ? 28 : 23)) + "px"); if (entries.length <= 12) list.classList.add("centered"); page.append(list); return page;
  }
  function generatePrint(form) {
    elements.printRoot.replaceChildren(); const onePage = form.elements.onePage.checked;
    if (form.elements.memberPages.checked) workspace.state.members.forEach(member => { for (let copy = 0; copy < Math.max(1, Number(form.elements.memberCopies.value) || 1); copy += 1) elements.printRoot.append(buildPrintPage(member, onePage, false)); });
    if (form.elements.cleanPages.checked) for (let copy = 0; copy < Math.max(0, Number(form.elements.cleanCopies.value) || 0); copy += 1) elements.printRoot.append(buildPrintPage(null, onePage, true));
    if (!elements.printRoot.children.length) { showToast("Vyber alespoň jeden výtisk."); return; }
    elements.exportDialog.close(); requestAnimationFrame(() => window.print());
  }
  async function loadLogoImage(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error("Logo může mít nejvýše 5 MB.");
    const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error("Obrázek nemá platné rozměry.")); img.onerror = () => reject(new Error("Soubor se nepodařilo načíst jako obrázek.")); img.src = source; });
  }
  function cropMetrics() {
    if (!logoCropState) return null;
    const rect = elements.logoCropStage.getBoundingClientRect(); const width = rect.width; const height = rect.height; const image = logoCropState.image;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * logoCropState.zoom;
    const displayWidth = image.naturalWidth * scale; const displayHeight = image.naturalHeight * scale;
    const maxX = Math.max(0, (displayWidth - width) / 2); const maxY = Math.max(0, (displayHeight - height) / 2);
    logoCropState.offsetX = Math.max(-maxX, Math.min(maxX, logoCropState.offsetX)); logoCropState.offsetY = Math.max(-maxY, Math.min(maxY, logoCropState.offsetY));
    return { width, height, scale, displayWidth, displayHeight };
  }
  function renderLogoCrop() {
    const metrics = cropMetrics(); if (!metrics) return;
    elements.logoCropImage.style.width = metrics.displayWidth + "px"; elements.logoCropImage.style.height = metrics.displayHeight + "px";
    elements.logoCropImage.style.left = (metrics.width / 2 + logoCropState.offsetX) + "px"; elements.logoCropImage.style.top = (metrics.height / 2 + logoCropState.offsetY) + "px";
  }
  async function openLogoCrop(file) {
    const image = await loadLogoImage(file); logoCropState = { image, zoom: 1, offsetX: 0, offsetY: 0, pointer: null };
    elements.logoCropImage.src = image.src; elements.logoCropZoom.value = "1"; elements.logoCropDialog.showModal();
    requestAnimationFrame(() => { renderLogoCrop(); elements.logoCropStage.focus(); });
  }
  function saveLogoCrop() {
    const metrics = cropMetrics(); if (!metrics) return;
    const image = logoCropState.image; const imageLeft = metrics.width / 2 + logoCropState.offsetX - metrics.displayWidth / 2; const imageTop = metrics.height / 2 + logoCropState.offsetY - metrics.displayHeight / 2;
    const sourceX = Math.max(0, -imageLeft / metrics.scale); const sourceY = Math.max(0, -imageTop / metrics.scale); const sourceWidth = Math.min(image.naturalWidth - sourceX, metrics.width / metrics.scale); const sourceHeight = Math.min(image.naturalHeight - sourceY, metrics.height / metrics.scale);
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512; const context = canvas.getContext("2d"); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 512, 512);
    workspace.state.bandProfile.logoDataUrl = canvas.toDataURL("image/webp", .86); elements.logoCropDialog.close(); logoCropState = null; changed(); showToast("Čtvercový výřez loga je uložený.");
  }
  function parseDelimitedRow(line, delimiter) {
    const cells = []; let value = ""; let quoted = false;
    for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; } else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; } else value += char; }
    cells.push(value.trim()); return cells;
  }
  function parseImportRole(value) {
    const role = normalizedText(value); return ({ standard: "standard", bezna: "standard", bezny: "standard", opener: "opener", oteviraci: "opener", encore: "encore", pridavkova: "encore", pridavek: "encore", closer: "closer", zaverecna: "closer", zaviraci: "closer" })[role] || "standard";
  }
  function parseImportFields(value) { return parsePrintTags(value).map(tag => { const separator = tag.indexOf(":"); return { id: uid("field"), label: separator > 0 ? tag.slice(0, separator).trim().slice(0, 32) : "", value: (separator > 0 ? tag.slice(separator + 1) : tag).trim().slice(0, 64) }; }); }
  function parseBulkImport(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim()).filter(Boolean); if (!lines.length) return { songs: [], errors: ["Vlož alespoň jeden řádek."] };
    const first = lines[0]; const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ","; const rows = lines.map(line => parseDelimitedRow(line, delimiter)); const header = rows[0].map(normalizedText);
    const aliases = { title: ["nazev", "nazev skladby", "title", "song"], album: ["album"], duration: ["delka", "delka skladby", "duration", "time", "cas"], bpm: ["bpm", "tempo"], energy: ["energie", "energy"], role: ["role", "role v setu", "typ"], tags: ["stitky", "stitky pro tisk", "tags"] };
    const hasHeader = aliases.title.some(name => header.includes(name)); const positions = {};
    Object.entries(aliases).forEach(([key, names], fallback) => { const found = header.findIndex(cell => names.includes(cell)); positions[key] = hasHeader ? found : fallback; });
    const songs = []; const errors = []; const data = hasHeader ? rows.slice(1) : rows;
    data.slice(0, 1000).forEach((row, index) => {
      const lineNumber = index + (hasHeader ? 2 : 1); const get = key => positions[key] >= 0 ? row[positions[key]] || "" : ""; const title = get("title").trim(); const seconds = parseDuration(get("duration")); const bpmText = get("bpm").trim(); const bpm = bpmText ? Number(bpmText) : 0; const energyText = get("energy").trim(); const energy = energyText ? Number(energyText) : 3;
      if (!title) { errors.push("Řádek " + lineNumber + ": chybí název."); return; } if (seconds < 1 || seconds > 3600) { errors.push("Řádek " + lineNumber + ": neplatná délka."); return; } if (!Number.isFinite(bpm) || bpm < 0 || bpm > 300) { errors.push("Řádek " + lineNumber + ": BPM musí být 1–300."); return; }
      songs.push({ id: uid("song"), title: title.slice(0, 120), album: get("album").trim().slice(0, 120), seconds, bpm, energy: Number.isFinite(energy) ? Math.min(5, Math.max(1, Math.round(energy))) : 3, role: parseImportRole(get("role")), printFields: parseImportFields(get("tags")), memberDetails: {} });
    });
    if (data.length > 1000) errors.push("Najednou lze importovat nejvýše 1000 řádků."); return { songs, errors };
  }
  function importBulkSongs() {
    const result = parseBulkImport(elements.bulkImportText.value); if (result.errors.length) { showStatus(elements.bulkImportStatus, "Import oprav: " + result.errors.slice(0, 3).join(" ") + (result.errors.length > 3 ? " Další chyby: " + (result.errors.length - 3) + "." : "")); return; } const existing = new Set(workspace.state.songs.map(song => normalizedText(song.title) + "|" + normalizedText(song.album))); const added = []; let duplicates = 0;
    result.songs.forEach(song => { const key = normalizedText(song.title) + "|" + normalizedText(song.album); if (existing.has(key) || workspace.state.songs.length + added.length >= 3000) { duplicates += 1; return; } existing.add(key); added.push(song); });
    if (!added.length) { showStatus(elements.bulkImportStatus, result.errors[0] || (duplicates ? "Všechny skladby už v repertoáru jsou." : "Nebylo co importovat.")); return; }
    workspace.state.songs.push(...added); elements.bulkImportDialog.close(); elements.bulkImportText.value = ""; changed(); showToast("Importováno " + added.length + " skladeb" + (duplicates ? ", přeskočeno " + duplicates + " duplicit." : "."));
  }
  function downloadImportTemplate() {
    const link = document.createElement("a"); link.href = API + "/repertoire-template.xlsx?bandId=" + encodeURIComponent(activeBandId); link.download = "setlister-repertoar-sablona.xlsx"; document.body.append(link); link.click(); link.remove();
  }
  function bufferToBase64(buffer) { const bytes = new Uint8Array(buffer); let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
  async function loadImportFile(file) {
    if (!file) return; if (file.size > 3 * 1024 * 1024) throw new Error("Soubor může mít nejvýše 3 MB.");
    if (file.name.toLocaleLowerCase("cs").endsWith(".xlsx")) {
      showStatus(elements.bulkImportStatus, "Načítám XLSX…"); const payload = await api("/import-xlsx", { method: "POST", body: JSON.stringify({ bandId: activeBandId, contentBase64: bufferToBase64(await file.arrayBuffer()) }) });
      elements.bulkImportText.value = payload.rows.map(row => row.map(cell => String(cell || "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
    } else elements.bulkImportText.value = await file.text();
    const parsed = parseBulkImport(elements.bulkImportText.value); showStatus(elements.bulkImportStatus, parsed.songs.length + " připravených skladeb" + (parsed.errors.length ? " · " + parsed.errors.length + " řádků vyžaduje opravu" : ""), !parsed.errors.length);
  }

  document.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => activateAuthTab(button.dataset.authTab)));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { showAppView(button.dataset.view); if (button.dataset.view === "live") { startLivePolling(); if (!elements.liveStage.hidden) requestLiveWakeLock(); } else if (liveWakeLock) { liveWakeLock.release().catch(() => {}); liveWakeLock = null; } }));
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => elements[button.dataset.closeDialog].close()));
  elements.registerForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.authStatus, "Vytvářím účet…"); try { updateSession(await api("/register", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) })); } catch (error) { showStatus(elements.authStatus, error.message); } });
  elements.loginForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.authStatus, "Přihlašuji…"); try { updateSession(await api("/login", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) })); } catch (error) { showStatus(elements.authStatus, error.message); } });
  elements.logoutButton.addEventListener("click", async () => { try { await api("/logout", { method: "POST", body: "{}" }); } catch (_) {} clearTimeout(mailAgentPollTimer); session = null; workspace = null; mailAgentStatus = null; mailConversation = []; setScreen("auth"); });
  elements.createBandForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.onboardingStatus, "Zakládám kapelu…"); try { const payload = await api("/bands", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }); activeBandId = payload.band.id; localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); await refreshSession(); } catch (error) { showStatus(elements.onboardingStatus, error.message); } });
  elements.joinBandForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.onboardingStatus, "Připojuji ke kapele…"); try { const payload = await api("/bands/join", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }); activeBandId = payload.band.id; localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); await refreshSession(); } catch (error) { showStatus(elements.onboardingStatus, error.message); } });
  elements.appSongForm.addEventListener("submit", event => { event.preventDefault(); const payload = formPayload(event.currentTarget); const seconds = parseDuration(payload.duration); const bpm = Number(payload.bpm || 0); if (seconds < 1 || seconds > 3600) { showToast("Délku zadej jako 3:30 nebo počet sekund."); return; } if (!Number.isFinite(bpm) || bpm < 0 || bpm > 300) { showToast("BPM musí být mezi 1 a 300."); return; } workspace.state.songs.push({ id: uid("song"), title: payload.title.trim(), album: payload.album.trim(), seconds, bpm, energy: Number(payload.energy), role: payload.role, printFields: [], memberDetails: {} }); event.currentTarget.reset(); event.currentTarget.elements.duration.value = "3:30"; changed(); });
  elements.songEditForm.addEventListener("submit", event => { event.preventDefault(); saveSongForm(event.currentTarget); });
  elements.notesForm.addEventListener("submit", event => { event.preventDefault(); saveNotesForm(event.currentTarget); });
  elements.addSongPrintField.addEventListener("click", () => addPrintField("song"));
  elements.songNewFieldLabel.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addPrintField("song"); } });
  elements.addNotesPrintField.addEventListener("click", () => addPrintField("notes"));
  elements.notesNewFieldLabel.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addPrintField("notes"); } });
  elements.notesMemberSelect.addEventListener("change", populateNotesForm);
  elements.notesInstrument.addEventListener("change", updateNotesConditionalFields);
  elements.memberForm.addEventListener("submit", event => { event.preventDefault(); saveMemberForm(event.currentTarget); });
  elements.defaultInstrumentSelect.addEventListener("change", event => { event.target.dataset.preferred = event.target.value; });
  elements.openBulkImport.addEventListener("click", () => { showStatus(elements.bulkImportStatus, ""); elements.bulkImportDialog.showModal(); elements.bulkImportText.focus(); });
  elements.bulkImportForm.addEventListener("submit", event => { event.preventDefault(); importBulkSongs(); });
  elements.downloadImportTemplate.addEventListener("click", downloadImportTemplate);
  elements.bulkImportFile.addEventListener("change", async event => { const file = event.target.files[0]; if (!file) return; try { await loadImportFile(file); } catch (error) { showStatus(elements.bulkImportStatus, error.message || "Soubor se nepodařilo načíst."); } event.target.value = ""; });
  elements.appTargetMinutes.addEventListener("input", event => { if (!workspace || event.target.value === "") return; workspace.state.draft.targetMinutes = Math.max(1, Math.min(240, Number(event.target.value))); changed(); });
  elements.appTargetMinutes.addEventListener("blur", event => { if (!event.target.value) { event.target.value = String(workspace.state.draft.targetMinutes || 45); } });
  elements.setName.addEventListener("input", event => { workspace.state.draft.name = event.target.value; clearTimeout(saveTimer); saveTimer = setTimeout(saveWorkspace, 600); });
  elements.editSetName.addEventListener("click", () => { elements.setName.focus(); elements.setName.select(); });
  elements.setViewer.addEventListener("change", event => { workspace.state.draft.viewerMemberId = event.target.value; changed(); });
  elements.songSearch.addEventListener("input", renderWorkspace);
  elements.albumFilter.addEventListener("change", renderWorkspace); elements.energyFilter.addEventListener("change", renderWorkspace); elements.roleFilter.addEventListener("change", renderWorkspace);
  elements.smartOrderSet.addEventListener("click", openSmartOrderDialog); elements.applySmartOrder.addEventListener("click", () => { if (!smartOrderDraft.length) return; workspace.state.draft.songIds = [...smartOrderDraft]; elements.smartOrderDialog.close(); changed(); showToast("Návrh pořadí je použitý."); });
  elements.addEvent.addEventListener("click", () => openEventDialog()); elements.eventForm.addEventListener("submit", event => { event.preventDefault(); saveEventForm(event.currentTarget); }); elements.eventStatus.addEventListener("change", toggleEventHistoryFields); elements.eventSetlist.addEventListener("change", () => { if (elements.eventStatus.value === "completed") eventPlayedSongDraft = [...(savedSetlistById(elements.eventSetlist.value)?.songIds || [])]; renderEventPlayedSongs(); }); elements.addEventPlayedSong.addEventListener("click", () => { const id = elements.eventPlayedSongSelect.value; if (!id || eventPlayedSongDraft.includes(id)) return; eventPlayedSongDraft.push(id); renderEventPlayedSongs(); });
  elements.eventCalendarToggle.addEventListener("click", toggleEventCalendar);
  elements.eventCalendarPrevious.addEventListener("click", () => moveEventCalendarMonth(-1));
  elements.eventCalendarNext.addEventListener("click", () => moveEventCalendarMonth(1));
  elements.eventCalendarToday.addEventListener("click", () => chooseEventDate(new Date()));
  elements.eventDateInput.addEventListener("input", () => {
    elements.eventDateInput.setCustomValidity("");
    if (!elements.eventCalendar.hidden) {
      const selected = parseEventDate(elements.eventDateInput.value);
      if (selected) eventCalendarCursor = SetlisterPlanning.dateFromKey(selected);
      renderEventCalendar();
    }
  });
  elements.eventDialog.addEventListener("cancel", event => {
    if (!elements.eventCalendar.hidden) { event.preventDefault(); closeEventCalendar(true); }
  });
  elements.eventDialog.addEventListener("click", event => {
    if (!elements.eventCalendar.hidden && !elements.eventDateField.contains(event.target)) closeEventCalendar();
  });
  elements.rehearsalForm.addEventListener("submit", event => {
    event.preventDefault(); rehearsalPlanShown = true; renderRehearsalPreview();
  });
  elements.rehearsalScope.addEventListener("change", () => {
    rehearsalPlanShown = false; renderRehearsalPlanner(); enhanceSelects(elements.rehearsalPlanner);
  });
  elements.rehearsalMember.addEventListener("change", () => {
    renderRehearsalPlanner(); enhanceSelects(elements.rehearsalPlanner);
  });
  elements.rehearsalMinutes.addEventListener("input", () => { if (rehearsalPlanShown) renderRehearsalPreview(); });
  elements.taskForm.addEventListener("submit", event => { event.preventDefault(); saveTaskForm(event.currentTarget); });
  elements.taskCategoryFilter.addEventListener("change", renderTasks);
  elements.taskStateFilter.addEventListener("change", renderTasks);
  elements.cancelTaskEdit.addEventListener("click", () => { resetTaskForm(); enhanceSelect(elements.taskAssignee); });
  elements.concertAgendaTab.addEventListener("click", () => showConcertCalendar(false));
  elements.concertCalendarTab.addEventListener("click", () => showConcertCalendar(true));
  function moveBandCalendarMonth(offset) {
    const next = new Date(bandCalendarDate.getFullYear(), bandCalendarDate.getMonth() + offset, 1);
    if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
    bandCalendarDate = next;
    renderBandCalendar();
  }
  elements.bandCalendarPrevious.addEventListener("click", () => moveBandCalendarMonth(-1));
  elements.bandCalendarNext.addEventListener("click", () => moveBandCalendarMonth(1));
  elements.bandCalendarToday.addEventListener("click", () => { bandCalendarDate = new Date(); renderBandCalendar(); });
  elements.addCalendarEntry.addEventListener("click", () => openCalendarEntry());
  elements.addCalendarEntryOnDay.addEventListener("click", () => openCalendarEntry());
  elements.addConcertOnDay.addEventListener("click", () => openEventDialog("", false, SetlisterPlanning.dateKey(bandCalendarDate)));
  elements.calendarEntryForm.addEventListener("submit", event => { event.preventDefault(); saveCalendarEntry(event.currentTarget); });
  elements.deleteCalendarEntry.addEventListener("click", () => {
    const id = elements.calendarEntryForm.elements.entryId.value;
    const entries = workspace.state.calendarEntries;
    const entry = entries.find(item => item.id === id && item.userId === session.user.id);
    if (!entry || !window.confirm("Odstranit zápis „" + entry.title + "“?")) return;
    workspace.state.calendarEntries = entries.filter(item => item.id !== id);
    elements.calendarEntryDialog.close();
    changed();
  });
  elements.calendarSubscribe.addEventListener("toggle", () => { if (elements.calendarSubscribe.open) loadCalendarFeed(); });
  elements.createCalendarFeed.addEventListener("click", () => changeCalendarFeed(true));
  elements.revokeCalendarFeed.addEventListener("click", () => changeCalendarFeed(false));
  elements.copyCalendarFeed.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(elements.calendarFeedUrl.value); showToast("Odkaz zkopírován."); }
    catch (_) { elements.calendarFeedUrl.select(); }
  });
  elements.startLiveSet.addEventListener("click", startLiveSet); elements.stopLiveSet.addEventListener("click", stopLiveSet); elements.livePrevious.addEventListener("click", () => moveLiveSong(-1)); elements.liveNext.addEventListener("click", () => moveLiveSong(1));
  elements.liveSongCard.addEventListener("pointerdown", event => { liveSwipeStart = { id: event.pointerId, x: event.clientX }; elements.liveSongCard.setPointerCapture(event.pointerId); });
  elements.liveSongCard.addEventListener("pointerup", event => { if (!liveSwipeStart || liveSwipeStart.id !== event.pointerId) return; const distance = event.clientX - liveSwipeStart.x; liveSwipeStart = null; if (Math.abs(distance) >= 55) moveLiveSong(distance < 0 ? 1 : -1); });
  elements.liveSongCard.addEventListener("pointercancel", () => { liveSwipeStart = null; }); elements.liveSongCard.addEventListener("keydown", event => { if (event.key === "ArrowLeft") moveLiveSong(-1); if (event.key === "ArrowRight") moveLiveSong(1); });
  elements.enableLiveAudio.addEventListener("click", async () => { try { await enableLiveAudio(); showToast("Zvuk metronomu je na tomto zařízení povolený."); } catch (error) { showToast(error.message); } }); elements.startSharedMetronome.addEventListener("click", () => setSharedMetronome("start")); elements.stopSharedMetronome.addEventListener("click", () => setSharedMetronome("stop")); elements.liveCalibration.addEventListener("change", event => { const value = Math.max(-250, Math.min(250, Number(event.target.value) || 0)); event.target.value = String(value); localStorage.setItem("setlister-live-calibration", String(value)); liveLastScheduledBeat = -1; });
  elements.connectGmail.addEventListener("click", connectGmail);
  elements.mailChatForm.addEventListener("submit", event => { event.preventDefault(); askMailAgent(elements.mailQuestion.value.trim()); });
  elements.mailQuestion.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); elements.mailChatForm.requestSubmit(); } });
  elements.mailQuestion.addEventListener("input", event => { event.target.style.height = "auto"; event.target.style.height = Math.min(event.target.scrollHeight, 150) + "px"; });
  elements.mailQuickPrompts.querySelectorAll("button").forEach(button => button.addEventListener("click", () => askMailAgent(button.textContent.trim())));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !elements.liveStage.hidden) requestLiveWakeLock(); });
  elements.addInterlude.addEventListener("click", () => openInterludeDialog());
  elements.interludeForm.addEventListener("submit", event => { event.preventDefault(); saveInterlude(event.currentTarget); });
  elements.saveSetlist.addEventListener("click", () => {
    const { name, targetMinutes, songIds, interludes } = workspace.state.draft;
    const existing = workspace.state.savedSetlists.find(set => set.name.toLocaleLowerCase("cs") === name.toLocaleLowerCase("cs"));
    const snapshot = { targetMinutes, songIds: [...songIds], interludes: interludes.map(item => ({ ...item })) };
    if (existing) Object.assign(existing, snapshot);
    else workspace.state.savedSetlists.push({ id: uid("set"), name: name || "Setlist", ...snapshot });
    changed();
    showToast("Setlist je uložený.");
  });
  elements.openExport.addEventListener("click", () => { updateExportSummary(); elements.exportDialog.showModal(); });
  elements.exportForm.addEventListener("input", updateExportSummary); elements.exportForm.addEventListener("submit", event => { event.preventDefault(); generatePrint(event.currentTarget); });
  elements.addMember.addEventListener("click", () => openMemberDialog());
  elements.addCustomInstrument.addEventListener("click", addDraftCustomInstrument);
  elements.customInstrumentInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addDraftCustomInstrument(); } });
  elements.bandLogoInput.addEventListener("change", async event => { try { await openLogoCrop(event.target.files[0]); } catch (error) { showToast(error.message || "Logo se nepodařilo načíst."); } event.target.value = ""; });
  elements.logoCropZoom.addEventListener("input", event => { if (!logoCropState) return; logoCropState.zoom = Number(event.target.value); renderLogoCrop(); });
  elements.resetLogoCrop.addEventListener("click", () => { if (!logoCropState) return; logoCropState.zoom = 1; logoCropState.offsetX = 0; logoCropState.offsetY = 0; elements.logoCropZoom.value = "1"; renderLogoCrop(); });
  elements.saveLogoCrop.addEventListener("click", saveLogoCrop);
  elements.logoCropStage.addEventListener("pointerdown", event => { if (!logoCropState) return; event.preventDefault(); elements.logoCropStage.setPointerCapture(event.pointerId); logoCropState.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: logoCropState.offsetX, offsetY: logoCropState.offsetY }; elements.logoCropStage.classList.add("dragging"); });
  elements.logoCropStage.addEventListener("pointermove", event => { const pointer = logoCropState?.pointer; if (!pointer || pointer.id !== event.pointerId) return; logoCropState.offsetX = pointer.offsetX + event.clientX - pointer.x; logoCropState.offsetY = pointer.offsetY + event.clientY - pointer.y; renderLogoCrop(); });
  const finishLogoDrag = event => { if (!logoCropState?.pointer || logoCropState.pointer.id !== event.pointerId) return; logoCropState.pointer = null; elements.logoCropStage.classList.remove("dragging"); };
  elements.logoCropStage.addEventListener("pointerup", finishLogoDrag); elements.logoCropStage.addEventListener("pointercancel", finishLogoDrag);
  elements.logoCropStage.addEventListener("keydown", event => { if (!logoCropState || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? 12 : 3; if (event.key === "ArrowLeft") logoCropState.offsetX -= step; if (event.key === "ArrowRight") logoCropState.offsetX += step; if (event.key === "ArrowUp") logoCropState.offsetY -= step; if (event.key === "ArrowDown") logoCropState.offsetY += step; renderLogoCrop(); });
  elements.logoCropDialog.addEventListener("close", () => { logoCropState = null; elements.logoCropStage.classList.remove("dragging"); });
  window.addEventListener("resize", () => { if (elements.logoCropDialog.open) renderLogoCrop(); });
  elements.removeBandLogo.addEventListener("click", () => { workspace.state.bandProfile.logoDataUrl = ""; changed(); });
  elements.bandSwitcher.addEventListener("click", () => { renderBandDialog(); elements.bandDialog.showModal(); }); elements.closeBandDialog.addEventListener("click", () => elements.bandDialog.close()); elements.showOnboarding.addEventListener("click", () => { elements.bandDialog.close(); setScreen("onboarding"); });
  elements.copyCode.addEventListener("click", async () => { await navigator.clipboard.writeText(workspace.band.inviteCode); showToast("Pozvánkový kód je zkopírovaný."); });
  elements.rotateCode.addEventListener("click", async () => { try { const payload = await api("/bands/rotate-code", { method: "POST", body: JSON.stringify({ bandId: activeBandId }) }); workspace.band.inviteCode = payload.inviteCode; renderSettings(); showToast("Kapela má nový pozvánkový kód."); } catch (error) { showToast(error.message); } });
  document.addEventListener("click", () => closeCustomSelects()); document.addEventListener("keydown", event => { if (event.key === "Escape") closeCustomSelects(); });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  elements.liveCalibration.value = localStorage.getItem("setlister-live-calibration") || "0"; updateMailChatAvailability(false); enhanceSelects(document); activateAuthTab("register"); refreshSession();
})();
