/* ===== TempAdd Flux — Content Script (Floating Widget) ===== */
"use strict";

(() => {
  /* Prevent double injection */
  if (document.getElementById("tempadd-flux-host")) return;

  /* ---------- Shadow DOM setup ---------- */
  const host = document.createElement("div");
  host.id = "tempadd-flux-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
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

  /* ---------- Helper ---------- */
  function sendMessage(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(data, (response) => {
        resolve(response);
      });
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

  /* ---------- FAB ---------- */
  const fab = document.createElement("button");
  fab.className = "tempadd-fab";
  fab.setAttribute("aria-label", "Open TempAdd Flux temporary email");
  fab.setAttribute("tabindex", "0");
  fab.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
    </svg>
    <span class="fab-badge hidden" aria-label="Unread emails"></span>
  `;
  shadow.appendChild(fab);

  const fabBadge = fab.querySelector(".fab-badge");

  /* ---------- Card ---------- */
  const card = document.createElement("div");
  card.className = "tempadd-card hidden";
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

  /* ---------- FAB / Card toggling ---------- */
  fab.addEventListener("click", () => {
    if (isMinimized) {
      isMinimized = false;
      card.classList.remove("minimized", "hidden");
      return;
    }
    if (isCardOpen) {
      closeCard();
    } else {
      openCard();
    }
  });

  fab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fab.click();
    }
  });

  function openCard() {
    isCardOpen = true;
    isMinimized = false;
    card.classList.remove("hidden", "minimized");
    loadState();
    sendMessage({ action: "clearUnread" });
  }

  function closeCard() {
    isCardOpen = false;
    isMinimized = false;
    card.classList.add("hidden");
  }

  /* ---------- Card controls ---------- */
  card.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    const action = target.getAttribute("data-action");

    switch (action) {
      case "minimize":
        isMinimized = true;
        card.classList.add("hidden");
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
      li.setAttribute("aria-label",
        `Email from ${mail.from?.name || mail.from?.address || "unknown"}: ${mail.subject || "no subject"}`
      );

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

  /* ---------- Badge update ---------- */

  function updateFabBadge(count) {
    if (count <= 0 || isCardOpen) {
      fabBadge.classList.add("hidden");
      fabBadge.textContent = "";
    } else {
      fabBadge.classList.remove("hidden");
      fabBadge.textContent = count > 9 ? "9+" : String(count);
    }
  }

  /* ---------- Live storage updates ---------- */

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.unreadCount) {
      updateFabBadge(changes.unreadCount.newValue || 0);
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
  });

  /* ---------- Extension / Website Sync ---------- */
  function pushStateToWebsite(state) {
    if (state) {
      window.postMessage({ type: "TEMPADD_EXTENSION_STATE", state: state }, "*");
    }
  }

  // Push on initial load
  sendMessage({ action: "getState" }).then(pushStateToWebsite);

  // Push on storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      sendMessage({ action: "getState" }).then(pushStateToWebsite);
    }
  });

  // Listen for Website Requests
  window.addEventListener("message", (e) => {
    if (!e.data || !e.data.type) return;
    
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

  /* ---------- Initial badge load ---------- */
  sendMessage({ action: "getState" }).then((state) => {
    if (state && state.unreadCount) {
      updateFabBadge(state.unreadCount);
    }
  });
})();
