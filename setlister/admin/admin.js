"use strict";

const el = Object.fromEntries([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
const labels = {
  preview: "Otevření pohledu uživatele", grant_promo: "Přidělení měsíců zdarma",
  transfer_band: "Převod vlastnictví", delete_user: "Smazání účtu", delete_band: "Smazání kapely"
};
const number = new Intl.NumberFormat("cs-CZ");
const dateTime = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Prague" });
let identity;
let view = "bands";
let page = 0;
let selected;
let listRequest = 0;
let detailRequest = 0;
let searchTimer;
let action;

function node(tag, text, css) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (css) element.className = css;
  return element;
}

function button(text, handler, css = "button") {
  const control = node("button", text, css);
  control.type = "button";
  control.addEventListener("click", handler);
  return control;
}

function time(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

function status(message = "", error = false) {
  el.status.textContent = message;
  el.status.classList.toggle("error", error);
}

async function api(path, payload) {
  const options = payload ? { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload) } : {};
  const response = await fetch("/api/admin/" + path, { cache: "no-store", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Požadavek se nepodařil.");
  return result;
}

function heading(title, subtitle) {
  const block = node("div", undefined, "detail-heading");
  block.append(node("h2", title), node("p", subtitle, "muted"));
  return block;
}

function section(title, ...items) {
  const block = node("section", undefined, "detail-section");
  block.append(node("h3", title), ...items);
  return block;
}

function fact(name, value) {
  const item = node("span", name + " ", "fact");
  item.append(node("strong", value ?? "—"));
  return item;
}

function entry(name, subtitle, ...controls) {
  const row = node("div", undefined, "entry");
  const title = node("div");
  title.append(node("strong", name), node("small", subtitle));
  row.append(title, ...controls);
  return row;
}

async function refreshOverview() {
  const result = await api("overview");
  identity = result.identity;
  el.identity.textContent = identity.email + " · " + (identity.role === "owner" ? "Hlavní správce" : "Podpora");
  el.auditTab.hidden = identity.role !== "owner";
  const metrics = {
    users: "Uživatelské účty", bands: "Kapely", memberships: "Členství v kapelách",
    stageMembers: "Pódiové profily", promoBands: "Kapely s promo obdobím"
  };
  el.metrics.replaceChildren(...Object.entries(metrics).map(([key, label]) => {
    const card = node("article", undefined, "metric");
    card.append(node("strong", number.format(result.counts[key])), node("span", label));
    return card;
  }));
  el.metrics.hidden = false;
}

async function loadList() {
  if (view === "audit") return;
  clearTimeout(searchTimer);
  const currentView = view;
  const request = ++listRequest;
  const query = new URLSearchParams({ kind: view, q: el.search.value, page: String(page) });
  try {
    const result = await api("directory?" + query);
    if (request !== listRequest || currentView !== view) return;
    el.pageNumber.textContent = String(page + 1);
    el.prevPage.disabled = page === 0;
    el.nextPage.disabled = !result.more;
    const items = result.items.map(item => {
      const row = button("", () => showDetail(currentView, item.id), "row-button");
      row.dataset.id = item.id;
      row.append(node("strong", item.name), node("small", currentView === "users"
        ? item.email + " · kapely: " + item.bandCount
        : item.ownerEmail + " · účty: " + item.memberCount));
      row.setAttribute("aria-current", String(selected?.kind === currentView && selected.id === item.id));
      return row;
    });
    el.rows.replaceChildren(...(items.length ? items : [node("p", "Žádné výsledky.", "muted")]));
  } catch (error) {
    if (request === listRequest) status(error.message, true);
  }
}

function selectView(next) {
  view = next;
  page = 0;
  selected = null;
  el.search.value = "";
  el.directory.hidden = next === "audit";
  el.audit.hidden = next !== "audit";
  document.querySelectorAll("[data-view]").forEach(tab => tab.setAttribute("aria-pressed", String(tab.dataset.view === next)));
  el.directoryTitle.textContent = next === "users" ? "Uživatelé" : "Kapely";
  el.detail.replaceChildren(node("p", next === "users" ? "Vyber uživatele ze seznamu." : "Vyber kapelu ze seznamu."));
  if (next === "audit") loadAudit();
  else loadList();
}

async function showDetail(kind, id) {
  if (view !== kind) selectView(kind);
  const request = ++detailRequest;
  selected = { kind, id };
  el.rows.querySelectorAll("[data-id]").forEach(row => row.setAttribute("aria-current", String(row.dataset.id === id)));
  el.detail.replaceChildren(node("p", "Načítám…"));
  try {
    const data = await api((kind === "users" ? "user" : "band") + "?id=" + encodeURIComponent(id));
    if (request !== detailRequest || selected?.kind !== kind || selected.id !== id) return;
    if (kind === "users") renderUser(data);
    else renderBand(data);
  } catch (error) {
    if (request === detailRequest && selected?.id === id) el.detail.replaceChildren(node("p", error.message));
  }
}

function renderUser(user) {
  const items = user.bands.map(band => entry(band.name, band.role === "owner" ? "Vlastník" : "Člen",
    button("Detail kapely", () => showDetail("bands", band.id)),
    button("Otevřít jako uživatel", () => edit({ type: "preview", bandId: band.id, userId: user.id, name: band.name }))));
  el.detail.replaceChildren(heading(user.name, user.email + " · Registrace " + time(user.createdAt)),
    section("Kapely uživatele", ...(items.length ? items : [node("p", "Účet zatím nemá kapelu.", "muted")])));
  if (identity.role === "owner") {
    const owns = user.bands.some(band => band.ownsBand);
    const remove = button("Smazat účet", () => edit({ type: "delete_user", userId: user.id, name: user.email }), "button danger");
    remove.disabled = owns;
    el.detail.append(section("Správa účtu", remove, node("small", owns
      ? "Před smazáním převeď vlastnictví jeho kapel."
      : "Pódiové profily v kapelách se zachovají.")));
  }
}

function renderBand(band) {
  const counts = node("div", undefined, "facts");
  counts.append(fact("Účty", band.members.length), fact("Pódiové profily", band.stageMembers),
    fact("Skladby", band.songs), fact("Uložené setlisty", band.setlists));
  const promo = band.promoUntil ? "Zdarma od " + time(band.promoStarts) + " do " + time(band.promoUntil) : "Bez přidělených měsíců zdarma.";
  const billing = section("Přístup kapely", node("p", promo, "muted"));
  if (band.planUntil) billing.append(node("small", "Stávající období do " + time(band.planUntil)));
  if (identity.role === "owner") billing.append(button("Přidat měsíce zdarma",
    () => edit({ type: "grant_promo", bandId: band.id, name: band.name }), "button primary"));

  const members = band.members.map(member => {
    const controls = [button("Otevřít jako uživatel", () => edit({
      type: "preview", userId: member.id, bandId: band.id, name: band.name
    }))];
    if (identity.role === "owner" && member.id !== band.ownerId) {
      controls.push(button("Převést vlastnictví", () => edit({
        type: "transfer_band", userId: member.id, bandId: band.id, name: band.name, member: member.name
      })));
    }
    return entry(member.name, member.email + (member.role === "owner" ? " · Vlastník" : " · Člen"), ...controls);
  });
  const mailbox = { ready: "Připraveno", error: "Chyba synchronizace", syncing: "Synchronizuji", awaiting_initial: "Čeká na první synchronizaci" };
  const diagnostic = band.mail.map((mail, index) => entry("Schránka " + (index + 1), mailbox[mail.status] || "Stav neznámý",
    node("span", number.format(mail.messages) + " zpráv · " + time(mail.lastSync), "tag")));
  el.detail.replaceChildren(heading(band.name, "Poslední uložení " + time(band.updatedAt)), counts, billing,
    section("Registrovaní členové", ...members),
    section("Diagnostika Gmailu", ...(diagnostic.length ? diagnostic : [node("p", "Kapela zatím nemá připojený Gmail.", "muted")])));
  if (identity.role === "owner") el.detail.append(section("Správa kapely",
    button("Smazat kapelu", () => edit({ type: "delete_band", bandId: band.id, name: band.name }), "button danger")));
}

async function loadAudit() {
  try {
    const { items } = await api("audit");
    const rows = items.map(item => {
      const row = node("article", undefined, "audit-item");
      row.append(node("strong", labels[item.action] || item.action), node("p", item.reason),
        node("small", time(item.createdAt) + " · " + item.actor + " · " + item.targetId));
      return row;
    });
    el.audit.replaceChildren(node("h2", "Poslední zásahy správců"),
      ...(rows.length ? rows : [node("p", "Audit zatím nemá záznamy.", "muted")]));
  } catch (error) { status(error.message, true); }
}

function edit(request) {
  action = request;
  el.actionForm.reset();
  el.actionFields.replaceChildren();
  el.actionStatus.textContent = "";
  el.actionTitle.textContent = labels[request.type];
  el.actionSubmit.textContent = request.type === "preview" ? "Otevřít náhled" : "Potvrdit";
  const removing = request.type.startsWith("delete_");
  el.actionSubmit.className = removing ? "button danger" : "button primary";

  if (request.type === "grant_promo") {
    el.actionDescription.textContent = "Přístup pro kapelu „" + request.name + "“ se prodlouží o celé kalendářní měsíce.";
    const label = node("label", "Počet měsíců zdarma");
    const input = node("input");
    Object.assign(input, { name: "months", type: "number", min: "1", max: "36", value: "1", required: true });
    label.append(input);
    el.actionFields.append(label);
  } else if (removing) {
    el.actionDescription.textContent = request.type === "delete_band"
      ? "Smazáním kapely trvale odstraníš její repertoár, setlisty, koncerty a další kapelní data."
      : "Smazáním účtu ukončíš jeho přihlášení a členství v kapelách.";
    const label = node("label", "Pro potvrzení opiš „" + request.name + "“.");
    const input = node("input");
    Object.assign(input, { name: "confirmation", autocomplete: "off", required: true });
    label.append(input);
    el.actionFields.append(label);
  } else if (request.type === "transfer_band") {
    el.actionDescription.textContent = request.member + " převezme kapelu „" + request.name + "“. Dosavadní vlastník zůstane členem.";
  } else {
    el.actionDescription.textContent = "Zobrazí se repertoár, setlisty a osobní pokyny vybraného člena kapely „" + request.name + "“. Otevření se zapíše do auditu.";
  }
  el.actionDialog.showModal();
}

function preview(data) {
  const songsById = new Map(data.songs.map(song => [song.id, song]));
  el.previewTitle.textContent = data.bandName;
  el.previewIdentity.textContent = data.user.name + " · " + (data.member
    ? "Pódiový profil " + data.member : "Bez propojeného pódiového profilu") + " · Stav k " + time(data.updatedAt);
  const sets = data.sets.filter(set => set.songIds?.length || set.interludes?.length).map(set => {
    const group = node("details");
    const list = node("ol");
    const pauses = set.interludes || [];
    const ids = set.songIds || [];
    for (let index = 0; index <= ids.length; index += 1) {
      for (const pause of pauses.filter(item => item.position === index)) list.append(node("li", pause.title));
      if (index === ids.length) break;
      const song = songsById.get(ids[index]);
      if (song) list.append(node("li", song.personal.customTitle || song.title));
    }
    group.append(node("summary", (set.name || "Setlist") + " · skladeb: " + ids.length), list);
    return group;
  });
  el.previewSets.replaceChildren(...(sets.length ? sets : [node("p", "Kapela zatím nemá setlist.", "muted")]));
  const songs = data.songs.map(song => {
    const line = node("article", undefined, "preview-song");
    const details = [song.album, song.bpm ? song.bpm + " BPM" : "", song.archived ? "Archivovaná" : "",
      song.personal.capo ? "K" + song.personal.capo : "", song.personal.preset].filter(Boolean).join(" · ");
    line.append(node("strong", song.personal.customTitle || song.title));
    if (details) line.append(node("p", details));
    if (song.personal.note) line.append(node("p", song.personal.note));
    return line;
  });
  el.previewSongs.replaceChildren(...(songs.length ? songs : [node("p", "Kapela zatím nemá skladby.", "muted")]));
  el.previewDialog.showModal();
}

el.actionForm.addEventListener("submit", async event => {
  event.preventDefault();
  const current = action;
  if (!current || el.actionSubmit.disabled) return;
  const fields = new FormData(el.actionForm);
  const payload = { action: current.type, reason: fields.get("reason"), bandId: current.bandId, userId: current.userId };
  if (fields.has("months")) payload.months = Number(fields.get("months"));
  if (fields.has("confirmation")) payload.confirmation = fields.get("confirmation");
  el.actionSubmit.disabled = true;
  try {
    const result = await api("action", payload);
    el.actionDialog.close();
    if (result.preview) { preview(result.preview); return; }
    status(result.promo ? "Přístup zdarma do " + time(result.promo.endsAt) + "." : "Změna je uložená.");
    await refreshOverview();
    if (current.type.startsWith("delete_")) selectView(view);
    else if (selected) await showDetail(selected.kind, selected.id);
  } catch (error) {
    if (el.actionDialog.open) el.actionStatus.textContent = error.message;
    else status(error.message, true);
  } finally { el.actionSubmit.disabled = false; }
});

document.querySelectorAll("[data-close]").forEach(control => control.addEventListener("click", () => el[control.dataset.close].close()));
el.actionDialog.addEventListener("cancel", event => { if (el.actionSubmit.disabled) event.preventDefault(); });
el.previewDialog.addEventListener("close", () => {
  el.previewSets.replaceChildren();
  el.previewSongs.replaceChildren();
});
document.querySelectorAll("[data-view]").forEach(tab => tab.addEventListener("click", () => selectView(tab.dataset.view)));
el.search.addEventListener("input", () => {
  page = 0;
  clearTimeout(searchTimer);
  listRequest += 1;
  searchTimer = setTimeout(loadList, 180);
});
el.prevPage.addEventListener("click", () => { page -= 1; loadList(); });
el.nextPage.addEventListener("click", () => { page += 1; loadList(); });

refreshOverview().then(() => {
  el.workspace.hidden = false;
  selectView("bands");
}).catch(error => status(error.message, true));
