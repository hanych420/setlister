(() => {
  "use strict";

  const STORAGE_KEY = "setlister-public-mvp-v1";
  const defaults = {
    targetMinutes: 45,
    songs: [
      { id: "demo-1", title: "První jiskra", seconds: 215, energy: 4 },
      { id: "demo-2", title: "Noční linka", seconds: 248, energy: 3 },
      { id: "demo-3", title: "Bez mapy", seconds: 194, energy: 5 },
      { id: "demo-4", title: "Nádech", seconds: 276, energy: 2 },
      { id: "demo-5", title: "Poslední refrén", seconds: 232, energy: 5 }
    ],
    setIds: ["demo-1", "demo-2"]
  };

  const elements = {
    installApp: document.querySelector("#installApp"),
    songForm: document.querySelector("#songForm"),
    songTitle: document.querySelector("#songTitle"),
    songMinutes: document.querySelector("#songMinutes"),
    songSeconds: document.querySelector("#songSeconds"),
    repertoireList: document.querySelector("#repertoireList"),
    repertoireCount: document.querySelector("#repertoireCount"),
    setList: document.querySelector("#setList"),
    emptyState: document.querySelector("#emptyState"),
    targetMinutes: document.querySelector("#targetMinutes"),
    targetLabel: document.querySelector("#targetLabel"),
    totalTime: document.querySelector("#totalTime"),
    progressBar: document.querySelector("#progressBar"),
    resetDemo: document.querySelector("#resetDemo"),
    toast: document.querySelector("#toast")
  };

  let deferredInstallPrompt = null;
  let toastTimer = null;
  let state = load();

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(defaults));
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.songs) && Array.isArray(saved.setIds)) {
        return { targetMinutes: Number(saved.targetMinutes) || 45, songs: saved.songs, setIds: saved.setIds };
      }
    } catch (_) { /* Local demo falls back to sample data. */ }
    return cloneDefaults();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
  }

  function iconButton(label, title, action) {
    const button = document.createElement("button");
    button.className = "icon-button";
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", action);
    return button;
  }

  function render() {
    const selected = new Set(state.setIds);
    const available = state.songs.filter(song => !selected.has(song.id));
    elements.repertoireCount.textContent = String(available.length);
    elements.repertoireList.replaceChildren();
    available.forEach(song => {
      const row = document.createElement("article");
      row.className = "song-row";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = song.title;
      const duration = document.createElement("small");
      duration.textContent = formatTime(song.seconds);
      info.append(title, duration);
      const energy = document.createElement("span");
      energy.className = "energy";
      energy.textContent = `E${song.energy}`;
      const add = iconButton("＋", `Přidat ${song.title} do setu`, () => {
        state.setIds.push(song.id); save(); render();
      });
      row.append(info, energy, add);
      elements.repertoireList.append(row);
    });

    const setSongs = state.setIds.map(id => state.songs.find(song => song.id === id)).filter(Boolean);
    elements.setList.replaceChildren();
    setSongs.forEach((song, index) => {
      const row = document.createElement("li");
      row.className = "set-song";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = song.title;
      const meta = document.createElement("small");
      meta.textContent = `Energie ${song.energy}/5`;
      info.append(title, meta);
      const duration = document.createElement("small");
      duration.textContent = formatTime(song.seconds);
      const actions = document.createElement("div");
      actions.className = "set-actions";
      const up = iconButton("↑", "Posunout nahoru", () => move(index, index - 1));
      const down = iconButton("↓", "Posunout dolů", () => move(index, index + 1));
      up.disabled = index === 0;
      down.disabled = index === setSongs.length - 1;
      const remove = iconButton("×", `Odebrat ${song.title}`, () => {
        state.setIds.splice(index, 1); save(); render();
      });
      actions.append(up, down, remove);
      row.append(number, info, duration, actions);
      elements.setList.append(row);
    });

    elements.emptyState.hidden = setSongs.length > 0;
    const total = setSongs.reduce((sum, song) => sum + song.seconds, 0);
    const target = Math.max(1, Number(state.targetMinutes) || 45) * 60;
    elements.totalTime.textContent = formatTime(total);
    elements.targetLabel.textContent = `z ${formatTime(target)}`;
    elements.targetMinutes.value = String(state.targetMinutes);
    elements.progressBar.style.width = `${Math.min(100, total / target * 100)}%`;
    elements.progressBar.classList.toggle("over", total > target);
  }

  function move(from, to) {
    if (to < 0 || to >= state.setIds.length) return;
    const [id] = state.setIds.splice(from, 1);
    state.setIds.splice(to, 0, id);
    save(); render();
  }

  elements.songForm.addEventListener("submit", event => {
    event.preventDefault();
    const title = elements.songTitle.value.trim();
    const minutes = Number(elements.songMinutes.value);
    const seconds = Number(elements.songSeconds.value);
    if (!title || !Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) return;
    state.songs.push({ id: `song-${Date.now()}`, title, seconds: minutes * 60 + seconds, energy: 3 });
    elements.songTitle.value = "";
    save(); render(); showToast("Skladba je v repertoáru.");
  });

  elements.targetMinutes.addEventListener("input", event => {
    state.targetMinutes = Math.max(1, Math.min(240, Number(event.target.value) || 45));
    save(); render();
  });

  elements.resetDemo.addEventListener("click", () => {
    state = cloneDefaults(); save(); render(); showToast("Demo je zpět v původním stavu.");
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installApp.hidden = false;
  });
  elements.installApp.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    elements.installApp.hidden = true;
  });

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  }
  render();
})();
