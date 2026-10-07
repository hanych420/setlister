(() => {
  "use strict";

  const elements = {
    toggleConnections: document.querySelector("#toggleConnections"),
    connectionPanel: document.querySelector("#connectionPanel"),
    accountList: document.querySelector("#accountList"),
    connectGmail: document.querySelector("#connectGmail"),
    syncGmail: document.querySelector("#syncGmail"),
    connectionStatus: document.querySelector("#connectionStatus"),
    configurationWarning: document.querySelector("#configurationWarning"),
    chatForm: document.querySelector("#chatForm"),
    questionInput: document.querySelector("#questionInput"),
    chatMessages: document.querySelector("#chatMessages"),
    quickPrompts: document.querySelector(".quick-prompts"),
    feedbackModal: document.querySelector("#feedbackModal"),
    feedbackForm: document.querySelector("#feedbackForm"),
    feedbackQuestion: document.querySelector("#feedbackQuestion"),
    feedbackInput: document.querySelector("#feedbackInput"),
    feedbackError: document.querySelector("#feedbackError"),
    saveFeedback: document.querySelector("#saveFeedback"),
    closeFeedback: document.querySelector("#closeFeedback"),
    cancelFeedback: document.querySelector("#cancelFeedback"),
    adminSettings: document.querySelector("#adminSettings"),
    adminModal: document.querySelector("#adminModal"),
    closeAdmin: document.querySelector("#closeAdmin"),
    adminUnlock: document.querySelector("#adminUnlock"),
    adminHistory: document.querySelector("#adminHistory"),
    adminPinForm: document.querySelector("#adminPinForm"),
    adminPin: document.querySelector("#adminPin"),
    adminPinError: document.querySelector("#adminPinError"),
    unlockAdmin: document.querySelector("#unlockAdmin"),
    historyList: document.querySelector("#historyList"),
    toast: document.querySelector("#toast")
  };

  const conversation = [];
  const chatSessionId = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");
  let statusTimer = null;
  let toastTimer = null;
  let waiting = false;
  let activeFeedback = null;

  function showToast(message, error = false) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", error);
    elements.toast.classList.add("visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3500);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Požadavek selhal (${response.status}).`);
    return payload;
  }

  function formatDate(value) {
    if (!value) return "Ještě nesynchronizováno";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "medium", timeStyle: "short"
    }).format(date);
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function appendInline(parent, text, sourceMap) {
    const pattern = /\*\*([^*]+)\*\*|\[(M\d+)\]/g;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      if (match[1] !== undefined) {
        parent.append(create("strong", "", match[1]));
      } else {
        const source = sourceMap.get(match[2]);
        if (source?.url) {
          const link = create("a", "answer-citation", "e-mail ↗");
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.title = source.subject || "Otevřít zdrojový e-mail";
          parent.append(link);
        } else {
          const missing = create("span", "answer-citation missing", "zdroj");
          missing.title = "Zdrojový e-mail není v této odpovědi dostupný";
          parent.append(missing);
        }
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }

  function tableCells(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
  }

  function isTableDivider(line) {
    const cells = tableCells(line);
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  function renderAnswer(answer, sources = []) {
    const root = create("div", "answer-rich");
    const sourceMap = new Map(sources.map(source => [source.id, source]));
    const lines = String(answer || "").replace(/\r/g, "").split("\n");
    let index = 0;
    while (index < lines.length) {
      const line = lines[index].trim();
      if (!line) { index += 1; continue; }

      if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
        const wrapper = create("div", "answer-table-wrap");
        const table = create("table", "answer-table");
        const head = create("thead");
        const headRow = create("tr");
        tableCells(lines[index]).forEach(cell => {
          const th = create("th"); appendInline(th, cell, sourceMap); headRow.append(th);
        });
        head.append(headRow); table.append(head);
        const body = create("tbody");
        index += 2;
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
          const row = create("tr");
          tableCells(lines[index]).forEach(cell => {
            const td = create("td"); appendInline(td, cell, sourceMap); row.append(td);
          });
          body.append(row); index += 1;
        }
        table.append(body); wrapper.append(table); root.append(wrapper);
        continue;
      }

      const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
      if (bullet) {
        const ordered = /^\d/.test(line);
        const list = create(ordered ? "ol" : "ul");
        while (index < lines.length) {
          const item = lines[index].trim().match(ordered ? /^\d+[.)]\s+(.+)$/ : /^(?:[-*•])\s+(.+)$/);
          if (!item) break;
          const li = create("li"); appendInline(li, item[1], sourceMap); list.append(li); index += 1;
        }
        root.append(list);
        continue;
      }

      const heading = line.match(/^#{1,4}\s+(.+)$/);
      if (heading) {
        const title = create("h3"); appendInline(title, heading[1], sourceMap); root.append(title); index += 1;
        continue;
      }

      const paragraphLines = [line];
      index += 1;
      while (index < lines.length && lines[index].trim()
             && !/^(?:[-*•]|\d+[.)])\s+/.test(lines[index].trim())
             && !/^#{1,4}\s+/.test(lines[index].trim())
             && !(lines[index].includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]))) {
        paragraphLines.push(lines[index].trim()); index += 1;
      }
      const paragraph = create("p"); appendInline(paragraph, paragraphLines.join(" "), sourceMap); root.append(paragraph);
    }
    return root;
  }

  function renderAccounts(status) {
    elements.accountList.replaceChildren();
    elements.configurationWarning.hidden = status.configured && status.accessVerificationConfigured;
    if (!status.gmailConfigured) {
      elements.configurationWarning.textContent = "V nastavení Home Assistant add-onu chybí Google OAuth Client ID nebo Client Secret.";
    } else if (!status.openaiConfigured) {
      elements.configurationWarning.textContent = "V nastavení Home Assistant add-onu chybí OpenAI API klíč.";
    } else if (!status.accessVerificationConfigured) {
      elements.configurationWarning.textContent = "Cloudflare Access JWT ověření zatím není nastavené. Lokální testování funguje, ale před nasazením je potřeba doplnit Team domain a AUD.";
    }

    if (!status.accounts.length) {
      const empty = create("div", "account-empty");
      empty.append(create("strong", "", "Zatím není připojený žádný Gmail"));
      empty.append(create("p", "", "Připoj postupně oba kapelní účty. První indexace může chvíli trvat."));
      elements.accountList.append(empty);
    }

    status.accounts.forEach(account => {
      const row = create("article", "account-row");
      const identity = create("div", "account-identity");
      identity.append(create("span", "account-icon", account.email.slice(0, 1).toUpperCase()));
      const text = create("div");
      text.append(create("strong", "", account.email));
      text.append(create("small", "", `${account.message_count.toLocaleString("cs-CZ")} zpráv · ${formatDate(account.last_sync_at)}`));
      identity.append(text);
      const state = create("span", `account-state ${account.last_sync_error ? "error" : ""}`,
        account.last_sync_error ? "Chyba synchronizace" : account.last_sync_at ? "Aktuální" : "Indexuji…");
      row.append(identity, state);
      if (account.last_sync_error) row.title = account.last_sync_error;
      const remove = create("button", "account-remove", "Odpojit");
      remove.type = "button";
      remove.addEventListener("click", () => disconnectAccount(account.email));
      row.append(remove);
      elements.accountList.append(row);
    });

    elements.connectGmail.disabled = !status.gmailConfigured || status.accounts.length >= 2;
    elements.connectGmail.textContent = status.accounts.length >= 2 ? "Připojeny oba účty" : "＋ Připojit Gmail";
    elements.syncGmail.disabled = !status.accounts.length;
  }

  async function loadStatus(quiet = false) {
    try {
      const status = await api("/api/gmail/status");
      renderAccounts(status);
      if (!quiet) {
        let text = status.accounts.length ? `Připojeno ${status.accounts.length} ze 2 účtů` : "Čekám na první účet";
        const index = status.concertIndex;
        if (index?.complete) text += ` · PropBot eviduje ${index.concertCount} koncertů`;
        else if (index?.gmailReady) text += ` · PropBot zpracovává koncerty (${index.pendingThreads} zbývá)`;
        else if (status.accounts.length) text += " · evidence koncertů čeká na dokončení Gmailu";
        elements.connectionStatus.textContent = text;
      }
    } catch (error) {
      elements.connectionStatus.textContent = error.message;
      if (!quiet) showToast(error.message, true);
    }
  }

  async function connectGmail() {
    elements.connectGmail.disabled = true;
    try {
      const result = await api("/api/gmail/connect");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      showToast(error.message, true);
      elements.connectGmail.disabled = false;
    }
  }

  async function disconnectAccount(email) {
    if (!window.confirm(`Odpojit ${email} a odstranit jeho lokální index ze Setlisteru? V Gmailu se nic nezmění.`)) return;
    try {
      await api("/api/gmail/disconnect", { method: "POST", body: JSON.stringify({ email }) });
      showToast(`${email} byl odpojen. Gmail zůstal beze změny.`);
      await loadStatus();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function syncGmail() {
    elements.syncGmail.disabled = true;
    elements.connectionStatus.textContent = "Synchronizace spuštěna…";
    try {
      await api("/api/gmail/sync", { method: "POST" });
      showToast("Kontroluji nové zprávy v obou schránkách.");
      setTimeout(() => loadStatus(true), 2500);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      elements.syncGmail.disabled = false;
    }
  }

  function addUserMessage(question) {
    const message = create("article", "chat-message user-message");
    message.append(create("div", "message-bubble", question));
    elements.chatMessages.append(message);
  }

  function addLoadingMessage() {
    const message = create("article", "chat-message assistant-message loading-message");
    message.dataset.loading = "true";
    message.append(create("span", "assistant-mark", "P"));
    const bubble = create("div", "message-bubble");
    bubble.append(create("span", "typing-dot"), create("span", "typing-dot"), create("span", "typing-dot"));
    message.append(bubble);
    elements.chatMessages.append(message);
    return message;
  }

  function openFeedback(question, button) {
    activeFeedback = { question, button };
    elements.feedbackQuestion.textContent = question;
    elements.feedbackInput.value = "";
    elements.feedbackError.textContent = "";
    elements.saveFeedback.disabled = false;
    elements.saveFeedback.textContent = "Uložit poučení";
    elements.feedbackModal.showModal();
    requestAnimationFrame(() => elements.feedbackInput.focus());
  }

  function closeFeedback() {
    elements.feedbackModal.close();
    activeFeedback = null;
  }

  function addAssistantMessage(answer, sources = [], feedbackQuestion = "") {
    const message = create("article", "chat-message assistant-message");
    message.append(create("span", "assistant-mark", "P"));
    const content = create("div", "assistant-content");
    const renderedAnswer = renderAnswer(answer, sources);
    renderedAnswer.classList.add("message-bubble", "answer-text");
    content.append(renderedAnswer);
    if (feedbackQuestion) {
      const actions = create("div", "answer-actions");
      const feedbackButton = create("button", "answer-feedback", "Poučit asistenta");
      feedbackButton.type = "button";
      feedbackButton.title = "Napiš, co asistent pochopil špatně";
      feedbackButton.addEventListener("click", () => openFeedback(feedbackQuestion, feedbackButton));
      actions.append(feedbackButton);
      content.append(actions);
    }
    message.append(content);
    elements.chatMessages.append(message);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => elements.chatMessages.scrollTo({ top: elements.chatMessages.scrollHeight, behavior: "smooth" }));
  }

  async function ask(question) {
    if (waiting || !question.trim()) return;
    waiting = true;
    elements.questionInput.value = "";
    elements.questionInput.style.height = "auto";
    document.querySelector(".welcome-message")?.remove();
    addUserMessage(question);
    const loading = addLoadingMessage();
    scrollToBottom();
    elements.chatForm.querySelector("button").disabled = true;
    try {
      const result = await api("/api/ask", {
        method: "POST",
        body: JSON.stringify({ question, history: conversation.slice(-6), sessionId: chatSessionId })
      });
      loading.remove();
      addAssistantMessage(result.answer, result.sources || [], question);
      conversation.push({ role: "user", content: question }, { role: "assistant", content: result.answer });
    } catch (error) {
      loading.remove();
      addAssistantMessage(`Odpověď se nepodařilo získat: ${error.message}`);
    } finally {
      waiting = false;
      elements.chatForm.querySelector("button").disabled = false;
      elements.questionInput.focus();
      scrollToBottom();
    }
  }

  function showAdminUnlock(message = "") {
    elements.adminUnlock.hidden = false;
    elements.adminHistory.hidden = true;
    elements.adminPinError.textContent = message;
    elements.adminPin.value = "";
    elements.unlockAdmin.disabled = false;
    elements.unlockAdmin.textContent = "Odemknout";
    requestAnimationFrame(() => elements.adminPin.focus());
  }

  function renderHistory(sessions) {
    elements.historyList.replaceChildren();
    if (!sessions.length) {
      elements.historyList.append(create("p", "history-empty", "Zatím není uložená žádná konverzace."));
      return;
    }
    sessions.forEach(session => {
      const card = create("article", "history-session");
      const heading = create("div", "history-session-heading");
      const firstQuestion = session.messages.find(message => message.role === "user")?.content || "Konverzace";
      heading.append(create("strong", "", firstQuestion));
      heading.append(create("small", "", `${formatDate(session.last_activity_at)} · ${session.user_email}`));
      card.append(heading);
      const messages = create("div", "history-messages");
      session.messages.forEach(item => {
        const row = create("div", `history-message ${item.role === "user" ? "history-user" : "history-assistant"}`);
        row.append(create("span", "", item.role === "user" ? "Dotaz" : "PropBot"));
        if (item.role === "assistant") {
          const rendered = renderAnswer(item.content, item.sources || []);
          rendered.classList.add("history-answer");
          row.append(rendered);
        } else {
          row.append(create("p", "", item.content));
        }
        if (item.sources?.length) row.append(create("small", "", `${item.sources.length} zdrojových e-mailů`));
        messages.append(row);
      });
      card.append(messages);
      elements.historyList.append(card);
    });
  }

  async function loadAdminHistory() {
    const result = await api("/api/admin/chat-history");
    renderHistory(result.sessions || []);
    elements.adminUnlock.hidden = true;
    elements.adminHistory.hidden = false;
  }

  async function openAdmin() {
    elements.adminUnlock.hidden = true;
    elements.adminHistory.hidden = true;
    elements.adminModal.showModal();
    elements.historyList.replaceChildren();
    try {
      await loadAdminHistory();
    } catch (error) {
      showAdminUnlock(error.message.includes("PIN") || error.message.includes("vypršelo") ? "" : error.message);
    }
  }

  function closeAdmin() {
    elements.adminModal.close();
    elements.adminPinError.textContent = "";
  }

  elements.toggleConnections.addEventListener("click", () => {
    elements.connectionPanel.hidden = !elements.connectionPanel.hidden;
    elements.toggleConnections.classList.toggle("active", !elements.connectionPanel.hidden);
    if (!elements.connectionPanel.hidden) loadStatus();
  });
  elements.connectGmail.addEventListener("click", connectGmail);
  elements.syncGmail.addEventListener("click", syncGmail);
  elements.adminSettings.addEventListener("click", openAdmin);
  elements.closeAdmin.addEventListener("click", closeAdmin);
  elements.adminModal.addEventListener("click", event => {
    if (event.target === elements.adminModal) closeAdmin();
  });
  elements.adminPinForm.addEventListener("submit", async event => {
    event.preventDefault();
    elements.unlockAdmin.disabled = true;
    elements.unlockAdmin.textContent = "Ověřuji…";
    elements.adminPinError.textContent = "";
    try {
      await api("/api/admin/unlock", {method: "POST", body: JSON.stringify({pin: elements.adminPin.value})});
      await loadAdminHistory();
    } catch (error) {
      elements.adminPinError.textContent = error.message;
      elements.unlockAdmin.disabled = false;
      elements.unlockAdmin.textContent = "Zkusit znovu";
      elements.adminPin.select();
    }
  });
  elements.chatForm.addEventListener("submit", event => {
    event.preventDefault();
    ask(elements.questionInput.value.trim());
  });
  elements.questionInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.chatForm.requestSubmit();
    }
  });
  elements.questionInput.addEventListener("input", () => {
    elements.questionInput.style.height = "auto";
    elements.questionInput.style.height = `${Math.min(elements.questionInput.scrollHeight, 150)}px`;
  });
  elements.quickPrompts.addEventListener("click", event => {
    const button = event.target.closest("[data-prompt]");
    if (button) ask(button.dataset.prompt);
  });
  elements.closeFeedback.addEventListener("click", closeFeedback);
  elements.cancelFeedback.addEventListener("click", closeFeedback);
  elements.feedbackModal.addEventListener("click", event => {
    if (event.target === elements.feedbackModal) closeFeedback();
  });
  elements.feedbackForm.addEventListener("submit", async event => {
    event.preventDefault();
    const correction = elements.feedbackInput.value.trim();
    if (!activeFeedback || correction.length < 3) {
      elements.feedbackError.textContent = "Napiš prosím konkrétní opravu.";
      return;
    }
    const feedback = activeFeedback;
    elements.saveFeedback.disabled = true;
    elements.saveFeedback.textContent = "Ukládám…";
    elements.feedbackError.textContent = "";
    try {
      await api("/api/assistant/lessons", {
        method: "POST",
        body: JSON.stringify({ question: feedback.question, correction })
      });
      feedback.button.textContent = "✓ Poučení uloženo";
      feedback.button.disabled = true;
      closeFeedback();
      showToast("Poučení je uložené. Použiju ho u dalších dotazů.");
    } catch (error) {
      elements.feedbackError.textContent = error.message;
      elements.saveFeedback.disabled = false;
      elements.saveFeedback.textContent = "Zkusit znovu";
    }
  });

  loadStatus(true);
  statusTimer = setInterval(() => loadStatus(true), 30_000);
  window.addEventListener("pagehide", () => clearInterval(statusTimer));
})();
