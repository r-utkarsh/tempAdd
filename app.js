/* ===== TempAdd Flux — frontend logic (uses shared API module) ===== */

// ---- App state ----
let email = "";
let password = "";
let token = "";
let pollTimer = null;
let seenMessageIds = new Set();
let currentMessages = [];
let usingExtensionState = false;

// ---- DOM refs ----
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
const modal = $("modal");
const modalOverlay = $("modal-overlay");
const modalClose = $("modal-close");
const modalSubject = $("modal-subject");
const modalFrom = $("modal-from");
const modalBody = $("modal-body");

$("year").textContent = new Date().getFullYear();

/* ---------- Helpers (app-specific, not in shared API) ---------- */
function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 400);
  }, 2200);
}

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // A pleasant "ding" sound
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    oscillator.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.1); // A5

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    // Audio context initialization error suppressed in production
  }
}

/* ---------- Rendering ---------- */
function renderMessages(mails) {
  // Accepts a flat array of mail objects (from API.fetchMessages or extension state)
  currentMessages = mails;
  inboxCount.textContent = `${mails.length} message${mails.length === 1 ? "" : "s"}`;

  if (mails.length === 0) {
    emptyState.classList.remove("hidden");
    messageList.classList.add("hidden");
    messageList.innerHTML = "";
    return;
  }

  emptyState.classList.add("hidden");
  messageList.classList.remove("hidden");
  messageList.innerHTML = "";

  mails.forEach((mail) => {
    const isNew = !seenMessageIds.has(mail.id);
    const hasAttachments = mail.hasAttachments || false;
    const li = document.createElement("li");
    li.className =
      "group flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors duration-200 hover:bg-light/40";

    const initial = (mail.from?.name || mail.from?.address || "?").charAt(0).toUpperCase();

    li.innerHTML = `
      <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal text-sm font-bold text-white">${API.escapeHtml(initial)}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="min-w-0 truncate text-sm font-bold text-navy">${API.escapeHtml(
            mail.from?.name || mail.from?.address || "Unknown sender"
          )}</p>
          <span class="shrink-0 text-xs text-navy/50">${API.relativeTime(
            mail.createdAt
          )}</span>
        </div>
        <p class="mt-0.5 min-w-0 flex items-center gap-2 truncate text-sm font-medium text-navy/90">
          ${hasAttachments ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-navy/50"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>` : ""}${
            isNew
              ? '<span class="inline-block h-2 w-2 shrink-0 rounded-full bg-sky"></span>'
              : ""
          }
          ${API.escapeHtml(mail.subject || "(no subject)")}
        </p>
        <p class="mt-0.5 truncate text-xs text-navy/55">${API.escapeHtml(
          mail.intro || ""
        )}</p>
      </div>
    `;
    li.addEventListener("click", () => openMessage(mail.id));
    messageList.appendChild(li);
  });

  mails.forEach((m) => seenMessageIds.add(m.id));
}

async function openMessage(id) {
  modalSubject.textContent = "Loading...";
  modalFrom.textContent = "";
  modalBody.innerHTML =
    '<div class="flex justify-center py-10"><span class="h-8 w-8 animate-spin rounded-full border-[3px] border-light border-t-sky"></span></div>';
  openModal();

  const full = await API.fetchMessageBody(token, id);
  if (!full) {
    modalBody.innerHTML =
      '<p class="text-navy/70">Could not load this message.</p>';
    return;
  }

  modalSubject.textContent = full.subject || "(no subject)";
  modalFrom.textContent = `${full.from?.name || ""} <${
    full.from?.address || ""
  }>`;

  if (full.html && full.html.length) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "");
    iframe.style.width = "100%";
    iframe.style.height = "400px";
    iframe.style.border = "none";
    iframe.style.backgroundColor = "#ffffff";
    iframe.srcdoc = full.html.join("");
    modalBody.innerHTML = "";
    modalBody.appendChild(iframe);
  } else {
    modalBody.innerHTML = `<pre class="whitespace-pre-wrap font-sans">${API.escapeHtml(
      full.text || "(empty message)"
    )}</pre>`;
  }
}

function openModal() {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.style.overflow = "";
}

/* ---------- Polling ---------- */
async function pollInbox(manual = false) {
  if (usingExtensionState) {
    if (manual) {
      checkSpin.classList.add("animate-spin");
      window.postMessage({ type: "TEMPADD_REQUEST_REFRESH" }, window.location.origin);
      setTimeout(() => checkSpin.classList.remove("animate-spin"), 600);
    }
    return;
  }

  if (!token) return;

  if (manual) checkSpin.classList.add("animate-spin");
  try {
    const prevCount = currentMessages.length;
    const messages = await API.fetchMessages(token);
    if (messages.length > prevCount) {
      const newOnes = messages.filter((m) => !seenMessageIds.has(m.id));
      if (newOnes.length) {
        toast(`${newOnes.length} new message(s) received`);
        playNotificationSound();
      }
    }
    renderMessages(messages);
  } catch (e) {
    // Poll error suppressed in production
  } finally {
    if (manual) {
      setTimeout(() => checkSpin.classList.remove("animate-spin"), 600);
    }
  }
}

/* ---------- sessionStorage helpers ---------- */
function saveSession() {
  sessionStorage.setItem("tempadd_email", email);
  sessionStorage.setItem("tempadd_password", password);
  sessionStorage.setItem("tempadd_token", token);
  // Only set creation time if it doesn't already exist (don't overwrite on re-save)
  if (!sessionStorage.getItem("tempadd_created")) {
    sessionStorage.setItem("tempadd_created", Date.now().toString());
  }
}

function loadSession() {
  const savedEmail = sessionStorage.getItem("tempadd_email");
  const savedPassword = sessionStorage.getItem("tempadd_password");
  const savedToken = sessionStorage.getItem("tempadd_token");
  const savedCreated = sessionStorage.getItem("tempadd_created");
  if (savedEmail && savedToken) {
    return {
      email: savedEmail,
      password: savedPassword,
      token: savedToken,
      created: savedCreated ? parseInt(savedCreated, 10) : Date.now(),
    };
  }
  return null;
}

function clearSession() {
  sessionStorage.removeItem("tempadd_email");
  sessionStorage.removeItem("tempadd_password");
  sessionStorage.removeItem("tempadd_token");
  sessionStorage.removeItem("tempadd_created");
}

/* ---------- Init / lifecycle ---------- */
async function init() {
  if (usingExtensionState) return;

  clearInterval(pollTimer);
  seenMessageIds = new Set();
  currentMessages = [];

  // Try restoring a saved session first
  const saved = loadSession();
  if (saved) {
    // Check if the saved session has already expired
    const elapsed = Date.now() - saved.created;
    if (elapsed >= API.MAILBOX_LIFETIME_MS) {
      if (!usingExtensionState) {
        clearSession();
        await newMailbox();
      }
      return;
    }

    email = saved.email;
    password = saved.password;
    token = saved.token;
    emailField.value = email;
    headerCopyBtn.textContent = "Copy Email";
    renderMessages([]);

    // Verify the saved token still works
    try {
      await pollInbox();
      pollTimer = setInterval(() => pollInbox(false), 4000);
      return; // restored successfully
    } catch {
      // Token expired or invalid — fall through to create a new one
      clearSession();
    }
  }

  // No saved session (or it expired) — create fresh mailbox
  await newMailbox();
}

async function newMailbox() {
  if (usingExtensionState) {
    window.postMessage({ type: "TEMPADD_REQUEST_NEW_MAILBOX" }, window.location.origin);
    return;
  }

  clearInterval(pollTimer);
  seenMessageIds = new Set();
  currentMessages = [];
  token = "";

  emailField.value = "Generating address...";
  headerCopyBtn.textContent = "Get Email";
  renderMessages([]);

  try {
    const { email: newEmail, password: newPass } = await API.createMailbox();

    // Re-check: if extension state arrived during the async API call, abort
    if (usingExtensionState) return;

    email = newEmail;
    password = newPass;
    token = await API.getToken({ email, password });

    // Re-check again after second async call
    if (usingExtensionState) return;

    emailField.value = email;
    headerCopyBtn.textContent = "Copy Email";
    // Clear old timestamp so saveSession writes a fresh one
    sessionStorage.removeItem("tempadd_created");
    saveSession();

    await pollInbox();
    pollTimer = setInterval(() => pollInbox(false), 4000);
  } catch (err) {
    emailField.value = "Error — click refresh to retry";
    toast("Something went wrong. Please try again.");
  }
}

/* ---------- Shared copy helper ---------- */
async function copyEmailToClipboard() {
  if (!email) return;
  try {
    await navigator.clipboard.writeText(email);
  } catch {
    emailField.select();
    document.execCommand("copy");
  }
  toast("Address copied to clipboard");
}

/* ---------- Event listeners ---------- */
copyBtn.addEventListener("click", async () => {
  await copyEmailToClipboard();
  copyLabel.textContent = "Copied!";
  setTimeout(() => (copyLabel.textContent = "Copy"), 1800);
});

headerCopyBtn.addEventListener("click", async () => {
  if (!email) {
    // No email yet — scroll to the generator section
    document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  await copyEmailToClipboard();
  headerCopyBtn.textContent = "Copied! ✓";
  setTimeout(() => (headerCopyBtn.textContent = "Copy Email"), 1800);
});

refreshBtn.addEventListener("click", () => {
  refreshIcon.classList.add("rotate-180");
  setTimeout(() => refreshIcon.classList.remove("rotate-180"), 500);
  clearSession();
  newMailbox();
});

checkBtn.addEventListener("click", () => pollInbox(true));

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", closeModal);
window.addEventListener("TEMPADD_OPEN_EMAIL", (event) => {
  if (event.detail && event.detail.mailId) {
    openMessage(event.detail.mailId);
  }
});

/* ---------- Extension Synchronization ---------- */
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data || !e.data.type) return;

  if (e.data.type === "TEMPADD_EXTENSION_STATE") {
    usingExtensionState = true;
    
    // Disable local polling
    clearInterval(pollTimer);
    
    const state = e.data.state;
    
    if (state.email) {
      email = state.email;
      token = state.token || token;
      
      emailField.value = email;
      headerCopyBtn.textContent = "Copy Email";
      
      // Extension messages are already a flat array
      const mails = state.messages || [];
      renderMessages(mails);
    } else {
      emailField.value = "Generating address...";
      headerCopyBtn.textContent = "Get Email";
      renderMessages([]);
      window.postMessage({ type: "TEMPADD_REQUEST_NEW_MAILBOX" }, window.location.origin);
    }
  }
});

// Kick things off
setTimeout(() => {
  if (window.tempaddExtensionInstalled) {
    usingExtensionState = true;
  } else {
    init();
  }
}, 50);
