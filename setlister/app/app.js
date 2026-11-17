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
      song.memberDetails = song.memberDetails && typeof song.memberDetails === "object" ? song.memberDetails : {};
      if ((song.note || Number(song.capo)) && state.members[0]) {
        const first = state.members[0]; song.memberDetails[first.id] = song.memberDetails[first.id] || { note: song.note || "", capo: Number(song.capo) || 0, instrumentId: first.defaultInstrumentId || "none" };
      }
      delete song.note; delete song.capo;
    });
    (workspace?.members || []).forEach(account => {
      if (!state.members.some(member => member.linkedUserId === account.id)) state.members.push({ id: uid("member"), name: account.name, linkedUserId: account.id, instruments: [], defaultInstrumentId: "", vocals: false });
    });
    state.members.forEach(member => { member.instruments = Array.isArray(member.instruments) ? member.instruments : []; member.vocals = Boolean(member.vocals); });
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
      const meta = document.createElement("small"); meta.textContent = formatTime(song.seconds) + " · E" + song.energy;
      const actions = document.createElement("div"); actions.className = "library-actions"; actions.append(iconAction("edit", "Upravit skladbu", () => openSongDialog(song.id)), iconAction("member", "Poznámky členů", () => openNotesDialog(song.id)), iconAction("add", "Přidat do setu", () => { state.draft.songIds.push(song.id); changed(); }, true)); row.append(info, meta, actions); return row;
    }));
    elements.appSetSongs.replaceChildren(...setSongs.map((song, index) => {
      const row = document.createElement("li"); row.className = "set-item"; row.draggable = true; row.dataset.index = String(index);
      row.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", String(index)));
      row.addEventListener("dragover", event => event.preventDefault());
      row.addEventListener("drop", event => { event.preventDefault(); moveSong(Number(event.dataTransfer.getData("text/plain")), index); });
      const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0");
      const detail = songMemberDetail(song, state.draft.viewerMemberId); const info = document.createElement("div"); const title = document.createElement("strong"); title.textContent = state.draft.viewerMemberId === "clean" ? song.title : detail.customTitle || song.title; const note = document.createElement("span"); note.className = "song-note"; note.textContent = detailSummary(song, state.draft.viewerMemberId) || song.album || ROLE_LABELS[song.role]; info.append(title, note);
      const meta = document.createElement("small"); const role = song.role !== "standard" ? ROLE_LABELS[song.role] + " · " : ""; meta.textContent = role + formatTime(song.seconds);
      const actions = document.createElement("div"); actions.className = "row-actions"; const up = rowButton("↑", "Posunout nahoru", () => moveSong(index, index - 1)); const down = rowButton("↓", "Posunout dolů", () => moveSong(index, index + 1)); const remove = rowButton("×", "Odebrat ze setu", () => { state.draft.songIds.splice(index, 1); changed(); }); up.disabled = index === 0; down.disabled = index === setSongs.length - 1; actions.append(up, down, remove);
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
      const meta = document.createElement("small"); meta.textContent = formatTime(song.seconds) + (song.role !== "standard" ? " · " + ROLE_LABELS[song.role] : "");
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
      const row = document.createElement("div"); row.className = "member"; const info = document.createElement("div"); const name = document.createElement("strong"); name.textContent = member.name; const instruments = document.createElement("small"); instruments.textContent = [...member.instruments.map(item => item.name), ...(member.vocals ? ["Zpěv"] : [])].join(" · ") || "Bez zadaného nástroje"; info.append(name, instruments);
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
  function openSongDialog(songId) {
    const song = workspace.state.songs.find(item => item.id === songId); if (!song) return;
    const form = elements.songEditForm; form.elements.songId.value = song.id; form.elements.title.value = song.title; form.elements.album.value = song.album || ""; form.elements.duration.value = formatTime(song.seconds); form.elements.energy.value = String(song.energy); form.elements.role.value = song.role || "standard"; elements.songDialogTitle.textContent = song.title;
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
    const detail = songMemberDetail(song, member.id); elements.notesCustomTitle.value = detail.customTitle || ""; elements.notesInstrument.replaceChildren(option("none", "Bez nástroje"), ...member.instruments.filter(item => item.id !== "none").map(item => option(item.id, item.name))); elements.notesInstrument.value = detail.instrumentId || member.defaultInstrumentId || "none";
    elements.notesCapo.replaceChildren(...Array.from({ length: 13 }, (_, index) => option(String(index), "K" + index))); elements.notesCapo.value = String(Number(detail.capo) || 0); elements.notesPreset.value = detail.preset || ""; elements.notesText.value = detail.note || ""; updateNotesConditionalFields(); enhanceSelect(elements.notesInstrument); enhanceSelect(elements.notesCapo);
  }
  function updateNotesConditionalFields() {
    const member = memberById(elements.notesMemberSelect.value); const instrument = memberInstrument(member, elements.notesInstrument.value); const guitar = ["guitar", "electric-guitar"].includes(instrument.kind); elements.notesCapoLabel.hidden = !guitar; elements.notesPresetLabel.hidden = instrument.kind !== "electric-guitar"; if (!guitar) elements.notesCapo.value = "0"; if (instrument.kind !== "electric-guitar") elements.notesPreset.value = "";
  }
  function saveNotesForm(form) {
    const song = workspace.state.songs.find(item => item.id === form.elements.songId.value); const member = memberById(elements.notesMemberSelect.value); if (!song || !member) return;
    const instrument = memberInstrument(member, elements.notesInstrument.value); song.memberDetails = song.memberDetails || {}; song.memberDetails[member.id] = { customTitle: elements.notesCustomTitle.value.trim(), instrumentId: elements.notesInstrument.value, capo: ["guitar", "electric-guitar"].includes(instrument.kind) ? Number(elements.notesCapo.value || 0) : 0, preset: instrument.kind === "electric-guitar" ? elements.notesPreset.value.trim() : "", note: elements.notesText.value.trim() };
    elements.notesDialog.close(); changed(); showToast("Osobní pokyny pro " + member.name + " jsou uložené.");
  }
  function openMemberDialog(memberId = "") {
    const member = memberId ? memberById(memberId) : null; const form = elements.memberForm; form.reset(); form.elements.memberId.value = member?.id || ""; form.elements.name.value = member?.name || ""; form.elements.vocals.checked = Boolean(member?.vocals); elements.memberDialogTitle.textContent = member ? "Upravit " + member.name : "Přidat člena";
    const selected = new Set((member?.instruments || []).map(item => item.id)); elements.instrumentChoices.replaceChildren(...INSTRUMENTS.map(instrument => { const label = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.value = instrument.id; input.checked = selected.has(instrument.id); const span = document.createElement("span"); span.textContent = instrument.name; label.append(input, span); return label; }));
    const custom = (member?.instruments || []).find(item => item.kind === "custom"); form.elements.customInstrument.value = custom?.name || ""; elements.memberDialog.showModal();
  }
  function saveMemberForm(form) {
    const payload = formPayload(form); const checked = Array.from(elements.instrumentChoices.querySelectorAll("input:checked")).map(input => instrumentById(input.value)).filter(Boolean); if (payload.customInstrument.trim()) checked.push({ id: uid("custom"), name: payload.customInstrument.trim(), kind: "custom" });
    const existing = payload.memberId ? memberById(payload.memberId) : null; const member = existing || { id: uid("member"), linkedUserId: "" }; member.name = payload.name.trim(); member.instruments = checked.map(item => ({ ...item })); member.defaultInstrumentId = member.instruments[0]?.id || "none"; member.vocals = form.elements.vocals.checked;
    if (!existing) workspace.state.members.push(member); elements.memberDialog.close(); changed();
  }
  function saveSongForm(form) {
    const payload = formPayload(form); const song = workspace.state.songs.find(item => item.id === payload.songId); const seconds = parseDuration(payload.duration); if (!song || seconds < 1 || seconds > 3600) { showToast("Délku zadej jako 3:30 nebo počet sekund."); return; }
    song.title = payload.title.trim(); song.album = payload.album.trim(); song.seconds = seconds; song.energy = Number(payload.energy); song.role = payload.role; song.memberDetails = song.memberDetails || {};
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
      const left = document.createElement("span"); left.className = "print-left"; if (member && ["guitar", "electric-guitar"].includes(instrument.kind) && Number(detail.capo)) left.textContent = "K" + detail.capo;
      const title = document.createElement("strong"); title.textContent = clean ? song.title : detail.customTitle || song.title;
      const right = document.createElement("span"); right.className = "print-right"; const instructions = [];
      if (instrumentChanged) instructions.push("→ " + instrument.name); if (instrument?.kind === "electric-guitar" && detail.preset) instructions.push(detail.preset); if (detail.note) instructions.push(detail.note); right.textContent = clean ? "" : instructions.join(" · ");
      item.append(left, title, right); list.append(item); lineWeight += 1 + (right.textContent.length > 45 ? .45 : 0); previousInstrument = instrument?.id || previousInstrument;
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
  async function resizeLogo(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error("Logo může mít nejvýše 5 MB.");
    const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; });
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL("image/webp", .86);
  }

  document.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => activateAuthTab(button.dataset.authTab)));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item === button)); document.querySelectorAll("[data-app-view]").forEach(view => view.classList.toggle("active", view.dataset.appView === button.dataset.view)); }));
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => elements[button.dataset.closeDialog].close()));
  elements.registerForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.authStatus, "Vytvářím účet…"); try { updateSession(await api("/register", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) })); } catch (error) { showStatus(elements.authStatus, error.message); } });
  elements.loginForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.authStatus, "Přihlašuji…"); try { updateSession(await api("/login", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) })); } catch (error) { showStatus(elements.authStatus, error.message); } });
  elements.logoutButton.addEventListener("click", async () => { try { await api("/logout", { method: "POST", body: "{}" }); } catch (_) {} session = null; workspace = null; setScreen("auth"); });
  elements.createBandForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.onboardingStatus, "Zakládám kapelu…"); try { const payload = await api("/bands", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }); activeBandId = payload.band.id; localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); await refreshSession(); } catch (error) { showStatus(elements.onboardingStatus, error.message); } });
  elements.joinBandForm.addEventListener("submit", async event => { event.preventDefault(); showStatus(elements.onboardingStatus, "Připojuji ke kapele…"); try { const payload = await api("/bands/join", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }); activeBandId = payload.band.id; localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); await refreshSession(); } catch (error) { showStatus(elements.onboardingStatus, error.message); } });
  elements.appSongForm.addEventListener("submit", event => { event.preventDefault(); const payload = formPayload(event.currentTarget); const seconds = parseDuration(payload.duration); if (seconds < 1 || seconds > 3600) { showToast("Délku zadej jako 3:30 nebo počet sekund."); return; } workspace.state.songs.push({ id: uid("song"), title: payload.title.trim(), album: payload.album.trim(), seconds, energy: Number(payload.energy), role: payload.role, memberDetails: {} }); event.currentTarget.reset(); event.currentTarget.elements.duration.value = "3:30"; changed(); });
  elements.songEditForm.addEventListener("submit", event => { event.preventDefault(); saveSongForm(event.currentTarget); });
  elements.notesForm.addEventListener("submit", event => { event.preventDefault(); saveNotesForm(event.currentTarget); });
  elements.notesMemberSelect.addEventListener("change", populateNotesForm);
  elements.notesInstrument.addEventListener("change", updateNotesConditionalFields);
  elements.memberForm.addEventListener("submit", event => { event.preventDefault(); saveMemberForm(event.currentTarget); });
  elements.appTargetMinutes.addEventListener("input", event => { if (!workspace || event.target.value === "") return; workspace.state.draft.targetMinutes = Math.max(1, Math.min(240, Number(event.target.value))); changed(); });
  elements.appTargetMinutes.addEventListener("blur", event => { if (!event.target.value) { event.target.value = String(workspace.state.draft.targetMinutes || 45); } });
  elements.setName.addEventListener("input", event => { workspace.state.draft.name = event.target.value; clearTimeout(saveTimer); saveTimer = setTimeout(saveWorkspace, 600); });
  elements.setViewer.addEventListener("change", event => { workspace.state.draft.viewerMemberId = event.target.value; changed(); });
  elements.songSearch.addEventListener("input", renderWorkspace);
  elements.albumFilter.addEventListener("change", renderWorkspace); elements.energyFilter.addEventListener("change", renderWorkspace); elements.roleFilter.addEventListener("change", renderWorkspace);
  elements.saveSetlist.addEventListener("click", () => { const draft = workspace.state.draft; const existing = workspace.state.savedSetlists.find(set => set.name.toLocaleLowerCase("cs") === draft.name.toLocaleLowerCase("cs")); if (existing) { existing.songIds = [...draft.songIds]; existing.targetMinutes = draft.targetMinutes; } else workspace.state.savedSetlists.push({ id: uid("set"), name: draft.name || "Setlist", targetMinutes: draft.targetMinutes, songIds: [...draft.songIds] }); changed(); showToast("Setlist je uložený."); });
  elements.openExport.addEventListener("click", () => { updateExportSummary(); elements.exportDialog.showModal(); });
  elements.exportForm.addEventListener("input", updateExportSummary); elements.exportForm.addEventListener("submit", event => { event.preventDefault(); generatePrint(event.currentTarget); });
  elements.addMember.addEventListener("click", () => openMemberDialog());
  elements.bandLogoInput.addEventListener("change", async event => { try { workspace.state.bandProfile.logoDataUrl = await resizeLogo(event.target.files[0]); changed(); showToast("Logo kapely je uložené."); } catch (error) { showToast(error.message || "Logo se nepodařilo načíst."); } event.target.value = ""; });
  elements.removeBandLogo.addEventListener("click", () => { workspace.state.bandProfile.logoDataUrl = ""; changed(); });
  elements.bandSwitcher.addEventListener("click", () => { renderBandDialog(); elements.bandDialog.showModal(); }); elements.closeBandDialog.addEventListener("click", () => elements.bandDialog.close()); elements.showOnboarding.addEventListener("click", () => { elements.bandDialog.close(); setScreen("onboarding"); });
  elements.copyCode.addEventListener("click", async () => { await navigator.clipboard.writeText(workspace.band.inviteCode); showToast("Pozvánkový kód je zkopírovaný."); });
  elements.rotateCode.addEventListener("click", async () => { try { const payload = await api("/bands/rotate-code", { method: "POST", body: JSON.stringify({ bandId: activeBandId }) }); workspace.band.inviteCode = payload.inviteCode; renderSettings(); showToast("Kapela má nový pozvánkový kód."); } catch (error) { showToast(error.message); } });
  document.addEventListener("click", () => closeCustomSelects()); document.addEventListener("keydown", event => { if (event.key === "Escape") closeCustomSelects(); });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  enhanceSelects(document); activateAuthTab("register"); refreshSession();
})();
