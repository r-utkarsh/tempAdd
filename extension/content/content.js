/* ===== TempAdd Flux — Content Script (Floating Widget) ===== */
"use strict";

(() => {
  /* Prevent double injection */
  if (document.getElementById("tempadd-flux-host")) return;

  /* ---------- Shadow DOM setup ---------- */
  const host = document.createElement("div");
  host.id = "tempadd-flux-host";
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  /* Load isolated CSS */
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("content/floating-card.css");
  shadow.appendChild(link);

  /* ---------- State ---------- */
  let isCardOpen = false;
  let isMinimized = false;
  let seenIds = new Set();
  let currentEmail = "";
  let activeInput = null;
  let autofillEnabled = true;

  // Load the current preference for inline suggestions
  chrome.storage.local.get({ autofillEnabled: true }, (res) => {
    autofillEnabled = res.autofillEnabled;
  });

  /* ---------- Helper ---------- */
  function sendMessage(data) {
    return new Promise((resolve) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          resolve(undefined);
          return;
        }
        chrome.runtime.sendMessage(data, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve(undefined);
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        resolve(undefined);
      }
    });
  }

  function escapeHtml(str) {
    str = str || "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function relativeTime(dateStr) {
    const date = new Date(dateStr);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  }

  /* ---------- Autofill Button ---------- */
  const autofillBtn = document.createElement("button");
  autofillBtn.className = "tempadd-autofill-btn";
  autofillBtn.style.display = "none";
  autofillBtn.setAttribute("aria-label", "TempAdd Flux Autofill");
  autofillBtn.setAttribute("tabindex", "-1");
  autofillBtn.style.padding = "0";
  autofillBtn.innerHTML = `
    <img src="${chrome.runtime.getURL("assets/iconSpecial-48.png")}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; pointer-events: none;" />
  `;
  shadow.appendChild(autofillBtn);



  /* ---------- Card ---------- */
  const card = document.createElement("div");
  card.className = "tempadd-card";
  card.style.display = "none";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "TempAdd Flux temporary email widget");
  card.innerHTML = `
    <!-- Header -->
    <div class="card-header" data-drag="true">
      <div class="card-brand">
        <span class="card-brand-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
          </svg>
        </span>
        <span class="card-brand-text">TempAdd <span class="card-brand-accent">Flux</span></span>
      </div>
      <div class="card-controls">
        <button class="card-control-btn" data-action="minimize" aria-label="Minimize widget" tabindex="0">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14"></path>
          </svg>
        </button>
        <button class="card-control-btn" data-action="close" aria-label="Close widget" tabindex="0">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="card-body">
      <!-- Email section -->
      <label class="fc-label">Your temporary address</label>
      <div class="fc-email-row">
        <div class="fc-email-wrap">
          <input class="fc-email-input" type="text" readonly value="Loading..." aria-label="Temporary email address" />
        </div>
        <button class="fc-btn fc-btn-primary" data-action="copy" title="Copy to clipboard" aria-label="Copy email">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
          </svg>
          <span data-copy-label>Copy</span>
        </button>
        <button class="fc-btn fc-btn-outline" data-action="refresh" title="New address" aria-label="Generate new email">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
            <path d="M21 3v5h-5"></path>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
            <path d="M3 21v-5h5"></path>
          </svg>
        </button>
      </div>

      <!-- Inbox -->
      <div class="fc-inbox-header">
        <span class="fc-inbox-title">Inbox</span>
        <span class="fc-inbox-badge" data-inbox-count>0 messages</span>
      </div>

      <div class="fc-inbox-card">
        <!-- Empty state -->
        <div class="fc-empty" data-empty-state>
          <span class="fc-spinner" aria-hidden="true"></span>
          <div>
            <p class="fc-empty-title">Waiting for emails...</p>
            <p class="fc-empty-sub">Messages appear here automatically.</p>
          </div>
        </div>

        <!-- Message list -->
        <ul class="fc-message-list hidden" data-message-list role="list" aria-label="Emails"></ul>
      </div>

      <!-- Toast area -->
      <div class="fc-toast-area" data-toast-area></div>
    </div>
  `;
  shadow.appendChild(card);

  /* ---------- DOM Refs (inside shadow) ---------- */
  const emailInput = card.querySelector(".fc-email-input");
  const copyLabelEl = card.querySelector("[data-copy-label]");
  const inboxCountEl = card.querySelector("[data-inbox-count]");
  const emptyStateEl = card.querySelector("[data-empty-state]");
  const messageListEl = card.querySelector("[data-message-list]");
  const toastArea = card.querySelector("[data-toast-area]");


  /* ---------- Toast ---------- */
  function showToast(message) {
    const el = document.createElement("div");
    el.className = "fc-toast";
    el.textContent = message;
    el.setAttribute("role", "status");
    toastArea.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 350);
    }, 2000);
  }

  function openCard() {
    isCardOpen = true;
    isMinimized = false;
    card.style.display = "flex";
    card.classList.remove("minimized");
    // Position card centered on viewport
    card.style.top = `${(window.innerHeight - 520) / 2}px`;
    card.style.left = `${(window.innerWidth - 370) / 2}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
    loadState();
    sendMessage({ action: "clearUnread" });
  }

  function closeCard() {
    isCardOpen = false;
    isMinimized = false;
    card.style.display = "none";
  }

  /* ---------- Card controls ---------- */
  card.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");

    switch (action) {
      case "minimize":
        isMinimized = true;
        card.style.display = "none";
        break;
      case "close":
        closeCard();
        break;
      case "copy":
        copyEmail();
        break;
      case "refresh":
        createNewMailbox();
        break;
    }
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCard();
    }
  });

  /* ---------- Drag ---------- */
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const dragHandle = card.querySelector("[data-drag]");

  dragHandle.addEventListener("mousedown", (e) => {
    // Don't start drag if clicking a button
    if (e.target.closest("button")) return;

    isDragging = true;
    const rect = card.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;

    // Constrain to viewport
    const maxX = window.innerWidth - card.offsetWidth;
    const maxY = window.innerHeight - card.offsetHeight;

    card.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    card.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  /* ---------- Rendering ---------- */

  function renderMessages(messages) {
    const mails = messages || [];
    inboxCountEl.textContent = `${mails.length} message${mails.length === 1 ? "" : "s"}`;

    if (mails.length === 0) {
      emptyStateEl.style.display = "";
      messageListEl.classList.add("hidden");
      messageListEl.innerHTML = "";
      return;
    }

    emptyStateEl.style.display = "none";
    messageListEl.classList.remove("hidden");
    messageListEl.innerHTML = "";

    mails.forEach((mail) => {
      const isNew = !seenIds.has(mail.id);
      const li = document.createElement("li");
      li.className = "fc-message-item";
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "listitem");
      const cleanFrom = escapeHtml(mail.from?.name || mail.from?.address || "unknown");
      const cleanSubject = escapeHtml(mail.subject || "no subject");
      li.setAttribute("aria-label", `Email from ${cleanFrom}: ${cleanSubject}`);

      const initial = (mail.from?.name || mail.from?.address || "?")
        .charAt(0)
        .toUpperCase();
      const unreadDot = isNew ? '<span class="fc-unread-dot"></span>' : "";

      li.innerHTML = `
        <span class="fc-message-avatar">${escapeHtml(initial)}</span>
        <div class="fc-message-body">
          <div class="fc-message-top">
            <span class="fc-message-sender">${escapeHtml(mail.from?.name || mail.from?.address || "Unknown")}</span>
            <span class="fc-message-time">${relativeTime(mail.createdAt)}</span>
          </div>
          <p class="fc-message-subject">${unreadDot}${escapeHtml(mail.subject || "(no subject)")}</p>
        </div>
      `;

      messageListEl.appendChild(li);
    });

    mails.forEach((m) => seenIds.add(m.id));
  }
  /* ---------- Actions ---------- */

  async function loadState() {
    const state = await sendMessage({ action: "getState" });
    if (!state) return;

    if (state.email) {
      currentEmail = state.email;
      emailInput.value = state.email;
      renderMessages(state.messages || []);
    } else {
      emailInput.value = "No mailbox";
      renderMessages([]);
    }
  }

  async function copyEmail() {
    if (!currentEmail) return;
    try {
      await navigator.clipboard.writeText(currentEmail);
    } catch {
      // Fallback for content scripts
      const textarea = document.createElement("textarea");
      textarea.value = currentEmail;
      textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast("Copied!");
    copyLabelEl.textContent = "Copied!";
    setTimeout(() => (copyLabelEl.textContent = "Copy"), 1500);
  }

  async function createNewMailbox() {
    seenIds = new Set();
    emailInput.value = "Generating...";
    renderMessages([]);

    const result = await sendMessage({ action: "createMailbox" });
    if (result && result.success) {
      showToast("New address generated!");
      await loadState();
    } else {
      emailInput.value = "Error — try again";
      showToast("Something went wrong");
    }
  }

  /* ---------- Input Detection & Autofill Logic ---------- */

  // Focus-based detection: whitelists elements representing email inputs
  function isEmailInput(input) {
    if (!input || input.readOnly || input.disabled) return false;
    if (input.type === "email") return true;

    const name = (input.name || "").toLowerCase();
    const id = (input.id || "").toLowerCase();
    const autocomplete = (input.getAttribute("autocomplete") || "").toLowerCase();
    const placeholder = (input.getAttribute("placeholder") || "").toLowerCase();

    const matchesEmail = (str) => str.includes("email") || str.includes("e-mail");

    return matchesEmail(name) || matchesEmail(id) || matchesEmail(autocomplete) || matchesEmail(placeholder);
  }

  function positionIcon(input) {
    const rect = input.getBoundingClientRect();

    // Position at the right end of the input (using viewport relative bounds)
    const iconWidth = 24;
    const iconHeight = 24;

    const top = rect.top + (rect.height - iconHeight) / 2;
    const left = rect.left + rect.width - iconWidth - 8;

    autofillBtn.style.top = `${top}px`;
    autofillBtn.style.left = `${left}px`;
    autofillBtn.style.display = "flex";
  }

  function fillInput(input, value) {
    if (!input) return;

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setActiveInput(input) {
    activeInput = input;
    positionIcon(input);
    loadState();
  }

  function clearActiveInput() {
    activeInput = null;
    autofillBtn.style.display = "none";
  }

  /* ---------- Event Listeners for Autofill UI ---------- */

  document.addEventListener("focusin", (e) => {
    if (!autofillEnabled) return;
    const target = e.target;
    if (target && target.tagName === "INPUT" && isEmailInput(target)) {
      setActiveInput(target);
    }
  });

  document.addEventListener("focusout", (e) => {
    if (activeInput && e.target === activeInput) {
      setTimeout(() => {
        const focusedEl = shadow.activeElement;
        if (!focusedEl && !isCardOpen) {
          clearActiveInput();
        }
      }, 200);
    }
  });

  window.addEventListener("resize", () => {
    if (activeInput) {
      positionIcon(activeInput);
    }
  });

  document.addEventListener("scroll", () => {
    if (activeInput) {
      positionIcon(activeInput);
    }
  }, true);

  autofillBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeInput && currentEmail) {
      fillInput(activeInput, currentEmail);
      // Give feedback toast
      showToast("Autofilled!");
    }
  });

  autofillBtn.addEventListener("mousedown", (e) => e.preventDefault());

  /* ---------- Live storage updates ---------- */

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.autofillEnabled) {
      autofillEnabled = changes.autofillEnabled.newValue;
      if (!autofillEnabled) {
        clearActiveInput();
      }
    }

    if (changes.messages && isCardOpen) {
      renderMessages(changes.messages.newValue || []);
    }

    if (changes.email) {
      currentEmail = changes.email.newValue || "";
      if (isCardOpen) {
        emailInput.value = currentEmail || "No mailbox";
      }
    }

    if (changes.createdAt && isCardOpen) {
      loadState();
    }

    // Push updated state to website only if email or messages changed
    if (changes.email || changes.messages) {
      sendMessage({ action: "getState" }).then(pushStateToWebsite);
    }
  });

  /* ---------- Extension / Website Sync ---------- */

  const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://temp-add.vercel.app"
  ];

  function pushStateToWebsite(state) {
    if (state && ALLOWED_ORIGINS.includes(window.location.origin)) {
      const sanitizedState = {
        email: state.email || "",
        token: state.token || "",
        messages: state.messages || [],
        unreadCount: state.unreadCount || 0,
        createdAt: state.createdAt || 0
      };
      window.postMessage({ type: "TEMPADD_EXTENSION_STATE", state: sanitizedState }, window.location.origin);
    }
  }

  // Push on initial load
  sendMessage({ action: "getState" }).then(pushStateToWebsite);

  // Listen for Website Requests (origin-validated)
  window.addEventListener("message", (e) => {
    if (!e.data || !e.data.type) return;
    if (!ALLOWED_ORIGINS.includes(e.origin)) return;

    if (e.data.type === "TEMPADD_REQUEST_NEW_MAILBOX") {
      sendMessage({ action: "createMailbox" });
    } else if (e.data.type === "TEMPADD_REQUEST_REFRESH") {
      sendMessage({ action: "refreshInbox" });
    }
  });

  /* ---------- External Messages ---------- */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "OPEN_EMAIL" && message.mailId) {
      window.dispatchEvent(new CustomEvent("TEMPADD_OPEN_EMAIL", {
        detail: { mailId: message.mailId }
      }));
    }
  });
})();
