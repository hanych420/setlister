(() => {
  "use strict";
  const API = "/api/app";
  const ACTIVE_BAND_KEY = "setlister-active-band";
  const elements = Object.fromEntries(Array.from(document.querySelectorAll("[id]")).map(item => [item.id, item]));
  let session = null;
  let activeBandId = localStorage.getItem(ACTIVE_BAND_KEY) || "";
  let workspace = null;
  let revision = 0;
  let saveTimer = null;
  let toastTimer = null;

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      credentials: "same-origin", ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Požadavek se nepodařil.");
    return payload;
  }
  function formPayload(form) { return Object.fromEntries(new FormData(form).entries()); }
  function showStatus(node, message, success = false) {
    node.textContent = message || ""; node.classList.toggle("success", success);
  }
  function showToast(message) {
    clearTimeout(toastTimer); elements.appToast.textContent = message; elements.appToast.classList.add("visible");
    toastTimer = setTimeout(() => elements.appToast.classList.remove("visible"), 2500);
  }
  function formatTime(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
  }
  function setScreen(name) {
    elements.authView.hidden = name !== "auth";
    elements.onboardingView.hidden = name !== "onboarding";
    elements.workspaceView.hidden = name !== "workspace";
    const signedIn = name !== "auth";
    elements.userArea.hidden = !signedIn;
    elements.headerBand.hidden = name !== "workspace";
    elements.marketingLink.hidden = signedIn && name === "workspace";
  }
  function activateAuthTab(tab) {
    document.querySelectorAll("[data-auth-tab]").forEach(button => button.classList.toggle("active", button.dataset.authTab === tab));
    elements.registerForm.hidden = tab !== "register"; elements.loginForm.hidden = tab !== "login";
    showStatus(elements.authStatus, "");
  }
  function updateSession(payload) {
    session = payload; elements.userName.textContent = payload.user?.name || payload.user?.email || "";
    const bands = payload.bands || [];
    if (!bands.length) { setScreen("onboarding"); return; }
    if (!bands.some(band => band.id === activeBandId)) activeBandId = bands[0].id;
    localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); setScreen("workspace"); loadWorkspace();
  }
  async function refreshSession() {
    try { updateSession(await api("/session")); }
    catch (_) { session = null; workspace = null; setScreen("auth"); }
  }
  async function loadWorkspace() {
    if (!activeBandId) return;
    try {
      const payload = await api("/workspace?bandId=" + encodeURIComponent(activeBandId));
      workspace = payload; revision = payload.revision;
      elements.currentBandName.textContent = payload.band.name;
      elements.inviteCode.textContent = payload.band.inviteCode;
      elements.planStatus.textContent = payload.subscription.status === "active" ? "Aktivní plán" : "Zkušební provoz";
      elements.planName.textContent = payload.subscription.planName || "Setlister Early";
      renderWorkspace(); renderBandDialog();
    } catch (error) { showToast(error.message); }
  }
  function renderWorkspace() {
    if (!workspace) return;
    const state = workspace.state;
    const selected = new Set(state.draft.songIds);
    const available = state.songs.filter(song => !selected.has(song.id));
    const setSongs = state.draft.songIds.map(id => state.songs.find(song => song.id === id)).filter(Boolean);
    elements.appAvailableCount.textContent = String(available.length);
    elements.appAvailableSongs.replaceChildren(...available.map(song => {
      const row = document.createElement("article"); row.className = "song-item";
      const info = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = song.title;
      const note = document.createElement("span"); note.className = "song-note"; note.textContent = song.note || "Bez poznámky";
      info.append(title, note);
      const meta = document.createElement("small");
      meta.textContent = formatTime(song.seconds) + " · E" + song.energy + (Number(song.capo) ? " · K" + song.capo : "");
      const add = document.createElement("button"); add.type = "button"; add.textContent = "+"; add.title = "Přidat " + song.title;
      add.addEventListener("click", () => { state.draft.songIds.push(song.id); changed(); });
      row.append(info, meta, add); return row;
    }));
    elements.appSetSongs.replaceChildren(...setSongs.map((song, index) => {
      const row = document.createElement("li"); row.className = "set-item";
      const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0");
      const info = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = song.title;
      const note = document.createElement("span"); note.className = "song-note"; note.textContent = song.note || "Bez poznámky";
      info.append(title, note);
      const meta = document.createElement("small");
      if (Number(song.capo)) {
        const capo = document.createElement("span"); capo.className = "tag"; capo.textContent = "K" + song.capo; meta.append(capo);
      }
      meta.append(document.createTextNode(formatTime(song.seconds)));
      const actions = document.createElement("div"); actions.className = "row-actions";
      const up = rowButton("↑", "Posunout nahoru", () => moveSong(index, index - 1));
      const down = rowButton("↓", "Posunout dolů", () => moveSong(index, index + 1));
      const remove = rowButton("×", "Odebrat ze setu", () => { state.draft.songIds.splice(index, 1); changed(); });
      up.disabled = index === 0; down.disabled = index === setSongs.length - 1; actions.append(up, down, remove);
      row.append(number, info, meta, actions); return row;
    }));
    elements.appSetEmpty.hidden = setSongs.length > 0;
    const total = setSongs.reduce((sum, song) => sum + Number(song.seconds || 0), 0);
    const target = Math.max(1, Number(state.draft.targetMinutes) || 45) * 60;
    elements.appTotalTime.textContent = formatTime(total);
    elements.appTargetLabel.textContent = "z " + formatTime(target);
    elements.appTargetMinutes.value = String(state.draft.targetMinutes || 45);
    elements.appProgress.style.width = Math.min(100, total / target * 100) + "%";
    elements.appProgress.classList.toggle("over", total > target);
    renderRepertoire(); renderSettings();
  }
  function rowButton(label, title, action) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.title = title; button.addEventListener("click", action); return button;
  }
  function moveSong(from, to) {
    if (!workspace || to < 0 || to >= workspace.state.draft.songIds.length) return;
    const [id] = workspace.state.draft.songIds.splice(from, 1); workspace.state.draft.songIds.splice(to, 0, id); changed();
  }
  function renderRepertoire() {
    const songs = workspace?.state.songs || [];
    elements.appRepertoire.replaceChildren(...songs.map(song => {
      const row = document.createElement("article"); row.className = "repertoire-row";
      const title = document.createElement("strong"); title.textContent = song.title;
      const note = document.createElement("span"); note.className = "note"; note.textContent = song.note || "Bez poznámky";
      const meta = document.createElement("small");
      meta.textContent = formatTime(song.seconds) + " · E" + song.energy + (Number(song.capo) ? " · K" + song.capo : "");
      const actions = document.createElement("div"); actions.className = "row-actions";
      actions.append(rowButton("×", "Odstranit " + song.title, () => {
        workspace.state.songs = workspace.state.songs.filter(item => item.id !== song.id);
        workspace.state.draft.songIds = workspace.state.draft.songIds.filter(id => id !== song.id); changed();
      }));
      row.append(title, note, meta, actions); return row;
    }));
  }
  function renderSettings() {
    elements.inviteCode.textContent = workspace.band.inviteCode;
    elements.memberList.replaceChildren(...workspace.members.map(member => {
      const row = document.createElement("div"); row.className = "member";
      const name = document.createElement("strong"); name.textContent = member.name;
      const role = document.createElement("small"); role.textContent = member.role === "owner" ? "Vlastník" : "Člen";
      row.append(name, role); return row;
    }));
    elements.rotateCode.hidden = workspace.membership.role !== "owner";
  }
  function renderBandDialog() {
    if (!session) return;
    elements.bandList.replaceChildren(...session.bands.map(band => {
      const button = document.createElement("button"); button.type = "button";
      button.classList.toggle("active", band.id === activeBandId);
      const name = document.createElement("strong"); name.textContent = band.name;
      const role = document.createElement("small"); role.textContent = band.role === "owner" ? "Vlastník" : "Člen";
      button.append(name, role);
      button.addEventListener("click", () => {
        activeBandId = band.id; localStorage.setItem(ACTIVE_BAND_KEY, band.id); elements.bandDialog.close(); loadWorkspace();
      });
      return button;
    }));
  }
  function changed() {
    renderWorkspace(); elements.saveState.textContent = "Ukládám…"; clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWorkspace, 350);
  }
  async function saveWorkspace() {
    if (!workspace) return;
    try {
      const result = await api("/band-state", { method: "PUT", body: JSON.stringify({ bandId: activeBandId, revision, state: workspace.state }) });
      revision = result.revision; elements.saveState.textContent = "Uloženo";
    } catch (error) {
      elements.saveState.textContent = "Neuloženo";
      if (error.message.includes("Konflikt")) await loadWorkspace(); showToast(error.message);
    }
  }
  document.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => activateAuthTab(button.dataset.authTab)));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(item => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-app-view]").forEach(view => view.classList.toggle("active", view.dataset.appView === button.dataset.view));
  }));
  elements.registerForm.addEventListener("submit", async event => {
    event.preventDefault(); showStatus(elements.authStatus, "Vytvářím účet…");
    try { const payload = await api("/register", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }); showStatus(elements.authStatus, "", true); updateSession(payload); }
    catch (error) { showStatus(elements.authStatus, error.message); }
  });
  elements.loginForm.addEventListener("submit", async event => {
    event.preventDefault(); showStatus(elements.authStatus, "Přihlašuji…");
    try { const payload = await api("/login", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) }); showStatus(elements.authStatus, "", true); updateSession(payload); }
    catch (error) { showStatus(elements.authStatus, error.message); }
  });
  elements.logoutButton.addEventListener("click", async () => {
    try { await api("/logout", { method: "POST", body: "{}" }); } catch (_) {}
    session = null; workspace = null; setScreen("auth");
  });
  elements.createBandForm.addEventListener("submit", async event => {
    event.preventDefault(); showStatus(elements.onboardingStatus, "Zakládám kapelu…");
    try {
      const payload = await api("/bands", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) });
      activeBandId = payload.band.id; localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); await refreshSession();
    } catch (error) { showStatus(elements.onboardingStatus, error.message); }
  });
  elements.joinBandForm.addEventListener("submit", async event => {
    event.preventDefault(); showStatus(elements.onboardingStatus, "Připojuji ke kapele…");
    try {
      const payload = await api("/bands/join", { method: "POST", body: JSON.stringify(formPayload(event.currentTarget)) });
      activeBandId = payload.band.id; localStorage.setItem(ACTIVE_BAND_KEY, activeBandId); await refreshSession();
    } catch (error) { showStatus(elements.onboardingStatus, error.message); }
  });
  elements.appSongForm.addEventListener("submit", event => {
    event.preventDefault(); const payload = formPayload(event.currentTarget);
    workspace.state.songs.push({
      id: "song-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      title: payload.title.trim(), seconds: Number(payload.seconds), energy: Number(payload.energy),
      capo: Number(payload.capo), note: payload.note.trim()
    });
    event.currentTarget.reset(); changed();
  });
  elements.appTargetMinutes.addEventListener("input", event => {
    if (!workspace) return;
    workspace.state.draft.targetMinutes = Math.max(1, Math.min(240, Number(event.target.value) || 45)); changed();
  });
  elements.bandSwitcher.addEventListener("click", () => { renderBandDialog(); elements.bandDialog.showModal(); });
  elements.closeBandDialog.addEventListener("click", () => elements.bandDialog.close());
  elements.showOnboarding.addEventListener("click", () => { elements.bandDialog.close(); setScreen("onboarding"); });
  elements.copyCode.addEventListener("click", async () => {
    await navigator.clipboard.writeText(workspace.band.inviteCode); showToast("Pozvánkový kód je zkopírovaný.");
  });
  elements.rotateCode.addEventListener("click", async () => {
    try {
      const payload = await api("/bands/rotate-code", { method: "POST", body: JSON.stringify({ bandId: activeBandId }) });
      workspace.band.inviteCode = payload.inviteCode; renderSettings(); showToast("Kapela má nový pozvánkový kód.");
    } catch (error) { showToast(error.message); }
  });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  }
  activateAuthTab("register"); refreshSession();
})();
