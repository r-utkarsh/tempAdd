/* ===== TempAdd Flux — Popup Logic ===== */
"use strict";

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);
const emailField = $("email-field");
const copyBtn = $("copy-btn");
const copyLabel = $("copy-label");
const refreshBtn = $("refresh-btn");
const refreshIcon = $("refresh-icon");
const checkBtn = $("check-btn");
const checkSpin = $("check-spin");
const emptyState = $("empty-state");
const messageList = $("message-list");
const inboxCount = $("inbox-count");
const headerCopyBtn = $("header-copy-btn");
const viewAllWrap = $("view-all-wrap");
const viewAllBtn = $("view-all-btn");
const brand = document.querySelector(".brand");
const toastContainer = $("toast-container");

/* ---------- State ---------- */
let seenMessageIds = new Set();
let currentEmail = "";

/* ---------- Helpers ---------- */

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  el.setAttribute("role", "status");
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 400);
  }, 2200);
}

function sendMessage(data) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(data, (response) => {
        if (chrome.runtime.lastError) {
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

async function openOrFocusTab(action, payload = {}) {
  const tabs = await chrome.tabs.query({
    url: [
      "http://localhost:3000/*",
      "http://127.0.0.1:3000/*",
      "http://localhost:5500/*",
      "http://127.0.0.1:5500/*",
      "https://temp-add.vercel.app/*"
    ]
  });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    
    if (action === "OPEN_EMAIL") {
      chrome.tabs.sendMessage(tab.id, { action: "OPEN_EMAIL", mailId: payload.mailId });
    }
  } else {
    chrome.tabs.create({ url: "https://temp-add.vercel.app/#inbox" });
    // chrome.tabs.create({ url: "http://localhost:3000/#inbox" });
  }
}

/* ---------- Rendering ---------- */

function renderMessages(messages) {
  const mails = messages || [];
  inboxCount.textContent = `${mails.length} message${mails.length === 1 ? "" : "s"}`;

  if (mails.length === 0) {
    emptyState.classList.remove("hidden");
    messageList.classList.add("hidden");
    if (viewAllWrap) viewAllWrap.classList.add("hidden");
    messageList.innerHTML = "";
    return;
  }

  emptyState.classList.add("hidden");
  messageList.classList.remove("hidden");
  messageList.innerHTML = "";

  // Feature 4: Sort by newest and show max 2 messages
  const sortedMails = [...mails].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recentMessages = sortedMails.slice(0, 2);

  // Feature 5: Show overflow handling
  if (sortedMails.length > 2) {
    if (viewAllWrap) viewAllWrap.classList.remove("hidden");
  } else {
    if (viewAllWrap) viewAllWrap.classList.add("hidden");
  }

  recentMessages.forEach((mail) => {
    const isNew = !seenMessageIds.has(mail.id);
    const hasAttachments = mail.hasAttachments || false;
    const li = document.createElement("li");
    li.className = "message-item";
    li.setAttribute("role", "listitem");
    li.setAttribute("tabindex", "0");
    const cleanFrom = API.escapeHtml(mail.from?.name || mail.from?.address || "unknown");
    const cleanSubject = API.escapeHtml(mail.subject || "no subject");
    li.setAttribute("aria-label", `Email from ${cleanFrom}: ${cleanSubject}`);

    const initial = (mail.from?.name || mail.from?.address || "?")
      .charAt(0)
      .toUpperCase();

    const attachmentSvg = hasAttachments
      ? `<svg class="attachment-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`
      : "";

    const unreadDot = isNew ? '<span class="unread-dot"></span>' : "";

    li.innerHTML = `
      <span class="message-avatar">${API.escapeHtml(initial)}</span>
      <div class="message-body">
        <div class="message-top">
          <span class="message-sender">${API.escapeHtml(mail.from?.name || mail.from?.address || "Unknown sender")}</span>
          <span class="message-time">${API.relativeTime(mail.createdAt)}</span>
        </div>
        <p class="message-subject">
          ${attachmentSvg}${unreadDot}${API.escapeHtml(mail.subject || "(no subject)")}
        </p>
        <p class="message-preview">${API.escapeHtml(mail.intro || "")}</p>
      </div>
    `;

    // Feature 2: Clickable message cards (open in new tab or existing tab)
    const openHandler = () => {
      openOrFocusTab("OPEN_EMAIL", { mailId: mail.id });
    };
    li.addEventListener("click", openHandler);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openHandler();
      }
    });

    messageList.appendChild(li);
  });

  mails.forEach((m) => seenMessageIds.add(m.id));
}


/* ---------- Actions ---------- */

async function loadState() {
  const state = await sendMessage({ action: "getState" });
  
  // Load and set the state of the autofill toggle switch
  chrome.storage.local.get({ autofillEnabled: true }, (res) => {
    const toggle = $("autofill-toggle");
    if (toggle) toggle.checked = res.autofillEnabled;
  });

  if (!state) return;

  if (state.email) {
    currentEmail = state.email;
    emailField.value = state.email;
    headerCopyBtn.textContent = "Copy Email";
    renderMessages(state.messages || []);

    // Mark as seen / clear unread since popup is open
    await sendMessage({ action: "clearUnread" });
  } else {
    emailField.value = "No mailbox — click refresh";
    headerCopyBtn.textContent = "Get Email";
    renderMessages([]);
  }
}

async function createNewMailbox() {
  seenMessageIds = new Set();
  emailField.value = "Generating address...";
  headerCopyBtn.textContent = "Get Email";
  renderMessages([]);

  const result = await sendMessage({ action: "createMailbox" });
  if (result && result.success) {
    toast("New address generated!");
    await loadState();
  } else {
    emailField.value = "Error — click refresh to retry";
    toast("Something went wrong. Please try again.");
  }
}

async function refreshInbox() {
  checkSpin.classList.add("animate-spin");
  await sendMessage({ action: "refreshInbox" });
  await loadState();
  setTimeout(() => checkSpin.classList.remove("animate-spin"), 600);
}

async function copyEmailToClipboard() {
  if (!currentEmail) return;
  try {
    await navigator.clipboard.writeText(currentEmail);
  } catch {
    // Fallback
    emailField.select();
    document.execCommand("copy");
  }
  toast("Address copied to clipboard");
}

/* ---------- Event Listeners ---------- */

copyBtn.addEventListener("click", async () => {
  await copyEmailToClipboard();
  copyLabel.textContent = "Copied!";
  setTimeout(() => (copyLabel.textContent = "Copy"), 1800);
});

headerCopyBtn.addEventListener("click", async () => {
  if (!currentEmail) return;
  await copyEmailToClipboard();
  headerCopyBtn.textContent = "Copied! ✓";
  setTimeout(() => (headerCopyBtn.textContent = "Copy Email"), 1800);
});

refreshBtn.addEventListener("click", () => {
  refreshIcon.style.transform = "rotate(180deg)";
  setTimeout(() => (refreshIcon.style.transform = ""), 500);
  createNewMailbox();
});

checkBtn.addEventListener("click", () => refreshInbox());

// Feature 1: Clickable Branding
if (brand) {
  const openBrand = () => {
    openOrFocusTab("FOCUS_ONLY");
  };
  brand.addEventListener("click", openBrand);
  brand.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openBrand();
    }
  });
}

// Feature 5: View all messages
if (viewAllBtn) {
  viewAllBtn.addEventListener("click", () => {
    openOrFocusTab("FOCUS_ONLY");
  });
}

/* ---------- Live storage updates ---------- */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.messages) {
    renderMessages(changes.messages.newValue || []);
  }
  if (changes.email) {
    currentEmail = changes.email.newValue || "";
    emailField.value = currentEmail || "No mailbox";
  }
  if (changes.createdAt && changes.email) {
    // New mailbox was created externally
    loadState();
  }
});

/* ---------- Init ---------- */
const toggle = $("autofill-toggle");
if (toggle) {
  toggle.addEventListener("change", (e) => {
    chrome.storage.local.set({ autofillEnabled: e.target.checked });
  });
}
loadState();
