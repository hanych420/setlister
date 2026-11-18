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
    trigger.addEventListener("click", event => { event.stopPropagation(); const opening = !root.classList.contains("open"); closeCustomSelects(root); root.classList.toggle("open", opening); trigger.setAttribute("aria-expanded", String(opening)); });
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
    state.draft = state.draft || { name: "Nový koncert", targetMinutes: 45, songIds: [] };
    state.draft.name = state.draft.name || "Nový koncert";
    state.draft.songIds = Array.isArray(state.draft.songIds) ? state.draft.songIds : [];
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
    (workspace?.members || []).forEach(account => {
      if (!state.members.some(member => member.linkedUserId === account.id)) state.members.push({ id: uid("member"), name: account.name, linkedUserId: account.id, instruments: [], defaultInstrumentId: "", vocals: false });
    });
    state.members.forEach(member => { member.instruments = Array.isArray(member.instruments) ? member.instruments : []; member.defaultInstrumentId = member.instruments.some(item => item.id === member.defaultInstrumentId) ? member.defaultInstrumentId : "none"; member.vocals = Boolean(member.vocals); });
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
      workspace = await api("/workspace?bandId=" + encodeURIComponent(activeBandId)); revision = workspace.revision; workspace.state = normalizeState(workspace.state);
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
    if ((instrument.kind === "guitar" || instrument.kind === "electric-guitar") && Number(detail.capo)) parts.push("K" + detail.capo);
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
    const setSongs = state.draft.songIds.map(id => state.songs.find(song => song.id === id)).filter(Boolean);
    elements.setName.value = state.draft.name; elements.appAvailableCount.textContent = String(available.length);
    elements.setViewer.replaceChildren(option("clean", "Bez poznámek"), ...state.members.map(member => option(member.id, member.name)));
    elements.setViewer.value = state.draft.viewerMemberId || "clean";
    elements.appAvailableSongs.replaceChildren(...available.map(song => {
      const row = document.createElement("article"); row.className = "song-item";
      const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = song.title; const album = document.createElement("span"); album.className = "song-note"; album.textContent = song.album || "Bez alba"; info.append(title, album);
      const meta = document.createElement("small"); meta.textContent = [formatTime(song.seconds), song.bpm ? song.bpm + " BPM" : "", "E" + song.energy].filter(Boolean).join(" · ");
      const actions = document.createElement("div"); actions.className = "library-actions"; actions.append(iconAction("edit", "Upravit skladbu", () => openSongDialog(song.id)), iconAction("member", "Poznámky členů", () => openNotesDialog(song.id)), iconAction("add", "Přidat do setu", () => { state.draft.songIds.push(song.id); changed(); }, true)); row.append(info, meta, actions); return row;
    }));
    elements.appSetSongs.replaceChildren(...setSongs.map((song, index) => {
      const row = document.createElement("li"); row.className = "set-item"; row.draggable = true; row.dataset.index = String(index);
      row.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", String(index)));
      row.addEventListener("dragover", event => event.preventDefault());
      row.addEventListener("drop", event => { event.preventDefault(); moveSong(Number(event.dataTransfer.getData("text/plain")), index); });
      const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0");
      const detail = songMemberDetail(song, state.draft.viewerMemberId); const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = state.draft.viewerMemberId === "clean" ? song.title : detail.customTitle || song.title; const note = document.createElement("span"); note.className = "song-note"; note.textContent = detailSummary(song, state.draft.viewerMemberId) || song.album || ROLE_LABELS[song.role]; info.append(title, note);
      const meta = document.createElement("small"); const role = song.role !== "standard" ? ROLE_LABELS[song.role] : ""; meta.textContent = [role, formatTime(song.seconds), song.bpm ? song.bpm + " BPM" : ""].filter(Boolean).join(" · ");
      const actions = document.createElement("div"); actions.className = "row-actions set-song-actions"; const edit = iconAction("edit", "Upravit skladbu", () => openSongDialog(song.id)); const notes = iconAction("member", "Poznámky členů", () => openNotesDialog(song.id)); const up = rowButton("↑", "Posunout nahoru", () => moveSong(index, index - 1)); const down = rowButton("↓", "Posunout dolů", () => moveSong(index, index + 1)); const remove = rowButton("×", "Odebrat ze setu", () => { state.draft.songIds.splice(index, 1); changed(); }); up.disabled = index === 0; down.disabled = index === setSongs.length - 1; actions.append(edit, notes, up, down, remove);
      row.append(number, info, meta, actions); return row;
    }));
    elements.appSetEmpty.hidden = setSongs.length > 0;
    const total = setSongs.reduce((sum, song) => sum + Number(song.seconds || 0), 0); const target = Math.max(1, Number(state.draft.targetMinutes) || 45) * 60;
    elements.appTotalTime.textContent = formatTime(total); elements.appTargetLabel.textContent = "z " + formatTime(target); elements.appTargetMinutes.value = String(state.draft.targetMinutes || 45); elements.appProgress.style.width = Math.min(100, total / target * 100) + "%"; elements.appProgress.classList.toggle("over", total > target);
    renderRepertoire(); renderSettings(); renderSavedSetlists(); enhanceSelects(document);
  }
  function option(value, label) { const node = document.createElement("option"); node.value = value; node.textContent = label; return node; }
  function rowButton(label, title, action) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.title = title; button.addEventListener("click", action); return button; }
  function iconAction(kind, label, action, primary = false) {
    const icons = { edit: '<path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm17-10.6c.4-.4.4-1 0-1.4L19.5 3c-.4-.4-1-.4-1.4 0l-1.6 1.6L20 8.1 21 7Z"/>', member: '<path d="M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-2c0-3 2.8-5 6.5-5s6.5 2 6.5 5v2H2Zm13-7c3.1.1 7 1.6 7 5v2h-5v-2c0-1.9-.7-3.7-2-5Z"/>', add: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/>', load: '<path d="M12 3a9 9 0 1 0 8.5 6h-2.2A7 7 0 1 1 12 5c1.9 0 3.6.8 4.8 2H14v2h6V3h-2v2.1A9 9 0 0 0 12 3Z"/>' };
    const button = document.createElement("button"); button.type = "button"; button.className = "icon-action " + (primary ? "primary" : ""); button.title = label; button.setAttribute("aria-label", label); button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[kind]}</svg><span>${label}</span>`; button.addEventListener("click", action); return button;
  }
  function moveSong(from, to) { const ids = workspace?.state.draft.songIds || []; if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return; const [id] = ids.splice(from, 1); ids.splice(to, 0, id); changed(); }
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
    workspace.state.songs = workspace.state.songs.filter(item => item.id !== id); workspace.state.draft.songIds = workspace.state.draft.songIds.filter(songId => songId !== id); workspace.state.savedSetlists.forEach(set => { set.songIds = set.songIds.filter(songId => songId !== id); }); changed();
  }
  function renderSettings() {
    elements.inviteCode.textContent = workspace.band.inviteCode; elements.settingsBandName.textContent = workspace.band.name;
    elements.memberList.replaceChildren(...workspace.state.members.map(member => {
      const row = document.createElement("div"); row.className = "member"; const info = document.createElement("div"); const name = document.createElement("strong"); name.textContent = member.name; const instruments = document.createElement("small"); const instrumentNames = member.instruments.map(item => item.name); instruments.textContent = [...instrumentNames, ...(member.vocals ? ["Zpěv"] : []), "Výchozí: " + memberInstrument(member, member.defaultInstrumentId || "none").name].join(" · "); info.append(name, instruments);
      const status = document.createElement("span"); status.className = "member-status"; status.textContent = member.linkedUserId ? "má účet" : "bez účtu";
      const actions = document.createElement("div"); actions.className = "row-actions"; actions.append(rowButton("✎", "Upravit člena", () => openMemberDialog(member.id)), rowButton("×", "Odstranit člena", () => deleteMember(member.id))); row.append(info, status, actions); return row;
    }));
    elements.rotateCode.hidden = workspace.membership.role !== "owner";
  }
  function deleteMember(id) {
    const member = memberById(id); if (!member || !window.confirm("Opravdu odstranit člena „" + member.name + "“ ze setlistů?")) return;
    workspace.state.members = workspace.state.members.filter(item => item.id !== id); workspace.state.songs.forEach(song => delete song.memberDetails[id]); if (workspace.state.draft.viewerMemberId === id) workspace.state.draft.viewerMemberId = "clean"; changed();
  }
  function renderSavedSetlists() {
    const sets = workspace.state.savedSetlists;
    if (!sets.length) { const p = document.createElement("p"); p.className = "section-help"; p.textContent = "Zatím tu není žádný uložený setlist."; elements.savedSetlists.replaceChildren(p); return; }
    elements.savedSetlists.replaceChildren(...sets.map(set => {
      const row = document.createElement("article"); const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = set.name; const meta = document.createElement("small"); meta.textContent = set.songIds.length + " skladeb · cíl " + set.targetMinutes + " min"; info.append(title, meta);
      const actions = document.createElement("div"); actions.className = "saved-actions"; actions.append(iconAction("load", "Načíst setlist", () => { workspace.state.draft = { ...workspace.state.draft, name: set.name, targetMinutes: set.targetMinutes, songIds: [...set.songIds] }; changed(); }, true), rowButton("×", "Smazat uložený setlist", () => { workspace.state.savedSetlists = sets.filter(item => item.id !== set.id); changed(); })); row.append(info, actions); return row;
    }));
  }
  function renderBandDialog() {
    if (!session) return; elements.bandList.replaceChildren(...session.bands.map(band => {
      const button = document.createElement("button"); button.type = "button"; button.classList.toggle("active", band.id === activeBandId); const name = document.createElement("strong"); name.textContent = band.name; const role = document.createElement("small"); role.textContent = band.role === "owner" ? "Vlastník" : "Člen"; button.append(name, role); button.addEventListener("click", () => { activeBandId = band.id; localStorage.setItem(ACTIVE_BAND_KEY, band.id); elements.bandDialog.close(); loadWorkspace(); }); return button;
    }));
  }
  function changed() { renderWorkspace(); elements.saveState.textContent = "Ukládám…"; clearTimeout(saveTimer); saveTimer = setTimeout(saveWorkspace, 450); }
  async function saveWorkspace() {
    if (!workspace) return;
    try { const result = await api("/band-state", { method: "PUT", body: JSON.stringify({ bandId: activeBandId, revision, state: workspace.state }) }); revision = result.revision; elements.saveState.textContent = "Uloženo"; }
    catch (error) { elements.saveState.textContent = "Neuloženo"; if (error.message.includes("Konflikt")) await loadWorkspace(); showToast(error.message); }
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
    elements.notesCapo.replaceChildren(...Array.from({ length: 13 }, (_, index) => option(String(index), "K" + index))); elements.notesCapo.value = String(Number(detail.capo) || 0); elements.notesPreset.value = detail.preset || ""; notesPrintFieldDraft = normalizePrintFields(detail.printFields, detail.printTags).map(field => ({ ...field })); elements.notesNewFieldLabel.value = ""; renderPrintFieldEditor("notes"); elements.notesText.value = detail.note || ""; updateNotesConditionalFields(); enhanceSelect(elements.notesInstrument); enhanceSelect(elements.notesCapo);
  }
  function updateNotesConditionalFields() {
    const member = memberById(elements.notesMemberSelect.value); const instrument = memberInstrument(member, elements.notesInstrument.value || member?.defaultInstrumentId); const guitar = ["guitar", "electric-guitar"].includes(instrument.kind); elements.notesCapoLabel.hidden = !guitar; elements.notesPresetLabel.hidden = instrument.kind !== "electric-guitar"; if (!guitar) elements.notesCapo.value = "0"; if (instrument.kind !== "electric-guitar") elements.notesPreset.value = "";
  }
  function saveNotesForm(form) {
    const song = workspace.state.songs.find(item => item.id === form.elements.songId.value); const member = memberById(elements.notesMemberSelect.value); if (!song || !member) return;
    const instrument = memberInstrument(member, elements.notesInstrument.value || member.defaultInstrumentId); song.memberDetails = song.memberDetails || {}; song.memberDetails[member.id] = { customTitle: elements.notesCustomTitle.value.trim(), instrumentId: elements.notesInstrument.value, capo: ["guitar", "electric-guitar"].includes(instrument.kind) ? Number(elements.notesCapo.value || 0) : 0, preset: instrument.kind === "electric-guitar" ? elements.notesPreset.value.trim() : "", printFields: normalizePrintFields(notesPrintFieldDraft), note: elements.notesText.value.trim() };
    elements.notesDialog.close(); changed(); showToast("Osobní pokyny pro " + member.name + " jsou uložené.");
  }
  function openMemberDialog(memberId = "") {
    const member = memberId ? memberById(memberId) : null; const form = elements.memberForm; form.reset(); form.elements.memberId.value = member?.id || ""; form.elements.name.value = member?.name || ""; form.elements.vocals.checked = Boolean(member?.vocals); elements.memberDialogTitle.textContent = member ? "Upravit " + member.name : "Přidat člena";
    memberDraftCustomInstruments = (member?.instruments || []).filter(item => item.kind === "custom").map(item => ({ ...item })); memberDraftSelectedIds = new Set((member?.instruments || []).map(item => item.id)); elements.defaultInstrumentSelect.dataset.preferred = member?.defaultInstrumentId || "none"; elements.customInstrumentInput.value = ""; renderMemberInstrumentChoices(); elements.memberDialog.showModal();
  }
  function updateDefaultInstrumentOptions() {
    const select = elements.defaultInstrumentSelect; const current = select.dataset.preferred || select.value || "none"; const selected = [...INSTRUMENTS, ...memberDraftCustomInstruments].filter(item => item.id !== "none" && memberDraftSelectedIds.has(item.id));
    select.replaceChildren(option("none", "Bez nástroje"), ...selected.map(item => option(item.id, item.name))); select.value = selected.some(item => item.id === current) ? current : "none"; select.dataset.preferred = select.value; enhanceSelect(select);
  }
  function renderMemberInstrumentChoices() {
    const instruments = [...INSTRUMENTS, ...memberDraftCustomInstruments]; elements.instrumentChoices.replaceChildren(...instruments.map(instrument => {
      const wrapper = document.createElement("div"); wrapper.className = "instrument-choice-wrap"; const label = document.createElement("label"); label.className = "instrument-option"; const input = document.createElement("input"); input.type = "checkbox"; input.value = instrument.id; input.checked = memberDraftSelectedIds.has(instrument.id); input.addEventListener("change", () => { if (input.checked) memberDraftSelectedIds.add(instrument.id); else memberDraftSelectedIds.delete(instrument.id); updateDefaultInstrumentOptions(); }); const marker = document.createElement("i"); const name = document.createElement("span"); name.textContent = instrument.name; label.append(input, marker, name); wrapper.append(label);
      if (instrument.kind === "custom") { const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-custom-instrument"; remove.textContent = "×"; remove.title = "Odstranit " + instrument.name; remove.setAttribute("aria-label", "Odstranit vlastní nástroj " + instrument.name); remove.addEventListener("click", () => { memberDraftSelectedIds.delete(instrument.id); memberDraftCustomInstruments = memberDraftCustomInstruments.filter(item => item.id !== instrument.id); renderMemberInstrumentChoices(); }); wrapper.append(remove); }
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
    const existing = payload.memberId ? memberById(payload.memberId) : null; const member = existing || { id: uid("member"), linkedUserId: "" }; member.name = payload.name.trim(); member.instruments = checked.map(item => ({ ...item })); member.defaultInstrumentId = member.instruments.some(item => item.id === payload.defaultInstrumentId) ? payload.defaultInstrumentId : "none"; member.vocals = form.elements.vocals.checked;
    const validInstrumentIds = new Set(["none", ...member.instruments.map(item => item.id)]); workspace.state.songs.forEach(song => { const detail = song.memberDetails?.[member.id]; if (detail && !validInstrumentIds.has(detail.instrumentId)) { detail.instrumentId = "none"; detail.capo = 0; detail.preset = ""; } });
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
    const songs = workspace.state.draft.songIds.map(id => workspace.state.songs.find(song => song.id === id)).filter(Boolean); const page = document.createElement("section"); page.className = "print-page" + (onePage ? " one-page" : " flow-page");
    const header = document.createElement("header"); const logo = bandLogo(); if (logo) { const img = document.createElement("img"); img.src = logo; img.alt = ""; header.append(img); } const headerText = document.createElement("div"); const name = document.createElement("strong"); name.textContent = workspace.state.draft.name; const owner = document.createElement("span"); owner.textContent = clean ? "Čistý setlist" : member.name; headerText.append(name, owner); header.append(headerText); page.append(header);
    const list = document.createElement("ol"); list.className = "print-set"; let previousInstrument = member ? member.defaultInstrumentId || "none" : "none"; let lineWeight = 0;
    songs.forEach(song => {
      const detail = member ? songMemberDetail(song, member.id) : {}; const instrument = member ? memberInstrument(member, detail.instrumentId || member.defaultInstrumentId || "none") : null; const instrumentChanged = member && instrument.id !== previousInstrument; const item = document.createElement("li");
      const left = document.createElement("span"); left.className = "print-left"; const printTags = [];
      if (member && ["guitar", "electric-guitar"].includes(instrument.kind) && Number(detail.capo)) printTags.push("K" + detail.capo); if (member) printTags.push(...printFieldTexts(detail.printFields), ...printFieldTexts(song.printFields)); if (member && song.bpm) printTags.push(song.bpm + " BPM"); printTags.forEach(text => { const tag = document.createElement("i"); tag.textContent = text; left.append(tag); });
      const title = document.createElement("strong"); title.textContent = clean ? song.title : detail.customTitle || song.title;
      const right = document.createElement("span"); right.className = "print-right"; const instructions = [];
      if (instrumentChanged) instructions.push("→ " + instrument.name); if (instrument?.kind === "electric-guitar" && detail.preset) instructions.push(detail.preset); if (detail.note) instructions.push(detail.note); right.textContent = clean ? "" : instructions.join(" · ");
      const wrappedTagWeight = printTags.reduce((sum, text) => sum + Math.max(0, Math.ceil(text.length / 28) - 1) * .16, 0); item.append(left, title, right); list.append(item); lineWeight += 1 + (right.textContent.length > 45 ? .45 : 0) + Math.max(0, printTags.length - 1) * .12 + wrappedTagWeight; previousInstrument = instrument?.id || previousInstrument;
    });
    const maxFont = clean ? 44 : 34; const minFont = clean ? 15 : 13; const estimated = Math.floor((clean ? 580 : 540) / Math.max(1, lineWeight)); page.style.setProperty("--print-size", (onePage ? Math.max(minFont, Math.min(maxFont, estimated)) : (clean ? 28 : 23)) + "px"); if (songs.length <= 12) list.classList.add("centered"); page.append(list); return page;
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
      songs.push({ id: uid("song"), title: title.slice(0, 120), album: get("album").trim().slice(0, 120), seconds, bpm, energy: Number.isFinite(energy) ? Math.min(5, Math.max(1, Math.round(energy))) : 3, role: parseImportRole(get("role")), printFields: parsePrintTags(get("tags")).map(tag => ({ id: uid("field"), label: "", value: tag })), memberDetails: {} });
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
    const content = "\uFEFFNázev;Album;Délka;BPM;Energie;Role;Štítky\r\nPrvní píseň;První album;3:30;128;4;Otevírací;Hanych začíná | Intro na klik\r\n"; const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "setlister-repertoar-sablona.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => activateAuthTab(button.dataset.authTab)));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item === button)); document.querySelectorAll("[data-app-view]").forEach(view => view.classList.toggle("active", view.dataset.appView === button.dataset.view)); }));
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => elements[button.dataset.closeDialog].close()));
  elements.registerForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.authStatus, "Vytvářím účet…"); try { updateSession(await api("/register", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) })); } catch (error) { showStatus(elements.authStatus, error.message); } });
  elements.loginForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.authStatus, "Přihlašuji…"); try { updateSession(await api("/login", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) })); } catch (error) { showStatus(elements.authStatus, error.message); } });
  elements.logoutButton.addEventListener("click", async () => { try { await api("/logout", { method: "POST", body: "{}" }); } catch (_) {} session = null; workspace = null; setScreen("auth"); });
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
  elements.bulkImportFile.addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { showStatus(elements.bulkImportStatus, "Soubor může mít nejvýše 2 MB."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => { elements.bulkImportText.value = String(reader.result || ""); const parsed = parseBulkImport(elements.bulkImportText.value); showStatus(elements.bulkImportStatus, parsed.songs.length + " připravených skladeb" + (parsed.errors.length ? " · " + parsed.errors.length + " řádků vyžaduje opravu" : ""), !parsed.errors.length); }; reader.onerror = () => showStatus(elements.bulkImportStatus, "Soubor se nepodařilo načíst."); reader.readAsText(file, "utf-8"); event.target.value = ""; });
  elements.appTargetMinutes.addEventListener("input", event => { if (!workspace || event.target.value === "") return; workspace.state.draft.targetMinutes = Math.max(1, Math.min(240, Number(event.target.value))); changed(); });
  elements.appTargetMinutes.addEventListener("blur", event => { if (!event.target.value) { event.target.value = String(workspace.state.draft.targetMinutes || 45); } });
  elements.setName.addEventListener("input", event => { workspace.state.draft.name = event.target.value; clearTimeout(saveTimer); saveTimer = setTimeout(saveWorkspace, 600); });
  elements.editSetName.addEventListener("click", () => { elements.setName.focus(); elements.setName.select(); });
  elements.setViewer.addEventListener("change", event => { workspace.state.draft.viewerMemberId = event.target.value; changed(); });
  elements.songSearch.addEventListener("input", renderWorkspace);
  elements.albumFilter.addEventListener("change", renderWorkspace); elements.energyFilter.addEventListener("change", renderWorkspace); elements.roleFilter.addEventListener("change", renderWorkspace);
  elements.saveSetlist.addEventListener("click", () => { const draft = workspace.state.draft; const existing = workspace.state.savedSetlists.find(set => set.name.toLocaleLowerCase("cs") === draft.name.toLocaleLowerCase("cs")); if (existing) { existing.songIds = [...draft.songIds]; existing.targetMinutes = draft.targetMinutes; } else workspace.state.savedSetlists.push({ id: uid("set"), name: draft.name || "Setlist", targetMinutes: draft.targetMinutes, songIds: [...draft.songIds] }); changed(); showToast("Setlist je uložený."); });
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
  enhanceSelects(document); activateAuthTab("register"); refreshSession();
})();
