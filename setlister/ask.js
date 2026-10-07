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
    toast: document.querySelector("#toast")
  };

  const conversation = [];
  let statusTimer = null;
  let toastTimer = null;
  let waiting = false;

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
      if (!quiet) elements.connectionStatus.textContent = status.accounts.length
        ? `Připojeno ${status.accounts.length} ze 2 účtů` : "Čekám na první účet";
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
    message.append(create("span", "assistant-mark", "?"));
    const bubble = create("div", "message-bubble");
    bubble.append(create("span", "typing-dot"), create("span", "typing-dot"), create("span", "typing-dot"));
    message.append(bubble);
    elements.chatMessages.append(message);
    return message;
  }

  function addAssistantMessage(answer, sources = []) {
    const message = create("article", "chat-message assistant-message");
    message.append(create("span", "assistant-mark", "?"));
    const content = create("div", "assistant-content");
    content.append(create("div", "message-bubble answer-text", answer));
    if (sources.length) {
      const sourceWrap = create("div", "answer-sources");
      sourceWrap.append(create("strong", "source-heading", "Zdrojové e-maily"));
      sources.forEach(source => {
        const link = create("a", "source-card");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(create("span", "source-ref", `[${source.id}]`));
        const details = create("span", "source-details");
        details.append(create("strong", "", source.subject || "Bez předmětu"));
        details.append(create("small", "", `${source.sender || source.account} · ${formatDate(source.date)}`));
        if (source.attachments?.length) details.append(create("small", "source-attachment", `Příloha: ${source.attachments.join(", ")}`));
        link.append(details, create("span", "source-open", "↗"));
        sourceWrap.append(link);
      });
      content.append(sourceWrap);
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
        body: JSON.stringify({ question, history: conversation.slice(-6) })
      });
      loading.remove();
      addAssistantMessage(result.answer, result.sources || []);
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

  elements.toggleConnections.addEventListener("click", () => {
    elements.connectionPanel.hidden = !elements.connectionPanel.hidden;
    elements.toggleConnections.classList.toggle("active", !elements.connectionPanel.hidden);
    if (!elements.connectionPanel.hidden) loadStatus();
  });
  elements.connectGmail.addEventListener("click", connectGmail);
  elements.syncGmail.addEventListener("click", syncGmail);
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

  loadStatus(true);
  statusTimer = setInterval(() => loadStatus(true), 30_000);
  window.addEventListener("pagehide", () => clearInterval(statusTimer));
})();
