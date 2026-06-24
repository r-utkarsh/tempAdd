/* ===== TempAdd Flux — Background Service Worker ===== */
"use strict";

importScripts("../shared/api.js");

const ALARM_NAME = "tempadd-poll";
const ALARM_PERIOD = 1; // minutes (60 seconds)
const BADGE_COLOR = "#0077B6"; // royal

/* ---------- State helpers ---------- */

async function getState() {
  const data = await chrome.storage.local.get([
    "email",
    "password",
    "token",
    "createdAt",
    "messages",
    "seenIds",
    "unreadCount",
  ]);
  return {
    email: data.email || "",
    password: data.password || "",
    token: data.token || "",
    createdAt: data.createdAt || 0,
    messages: data.messages || [],
    seenIds: data.seenIds || [],
    unreadCount: data.unreadCount || 0,
  };
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

/* ---------- Badge ---------- */

function updateBadge(count) {
  const text = count <= 0 ? "" : count > 9 ? "9+" : String(count);
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

/* ---------- Notifications ---------- */

function showNotification(mail) {
  const sender =
    mail.from?.name || mail.from?.address || "Unknown sender";
  const subject = mail.subject || "(no subject)";

  chrome.notifications.create(`tempadd-mail-${mail.id}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
    title: subject,
    message: `From: ${sender}`,
    priority: 2,
  });
}

/* ---------- Mailbox creation ---------- */

let activeCreationPromise = null;

async function createNewMailbox() {
  // Prevent concurrent mailbox creation (race condition guard)
  if (activeCreationPromise) return activeCreationPromise;
  activeCreationPromise = _doCreateMailbox();
  return activeCreationPromise;
}

async function _doCreateMailbox() {
  try {
    const { email, password } = await API.createMailbox();
    const token = await API.getToken({ email, password });

    await setState({
      email,
      password,
      token,
      createdAt: Date.now(),
      messages: [],
      seenIds: [],
      unreadCount: 0,
    });

    updateBadge(0);
    ensureAlarm();

    return { success: true, email };
  } catch (err) {
    console.error("[TempAdd] Mailbox creation failed:", err.message);
    return { success: false, error: err.message };
  } finally {
    activeCreationPromise = null;
  }
}

/* ---------- Polling ---------- */

async function pollInbox() {
  const state = await getState();
  if (!state.token) return;

  // Check if mailbox has expired
  const elapsed = Date.now() - state.createdAt;
  if (elapsed >= API.MAILBOX_LIFETIME_MS) {
    console.log("[TempAdd] Mailbox expired, creating new one");
    await createNewMailbox();
    return;
  }

  try {
    const messages = await API.fetchMessages(state.token);
    const seenSet = new Set(state.seenIds);
    const newMails = messages.filter((m) => !seenSet.has(m.id));

    // Notify for each new email
    for (const mail of newMails) {
      showNotification(mail);
    }

    // Update seen IDs
    const updatedSeenIds = [
      ...new Set([...state.seenIds, ...messages.map((m) => m.id)]),
    ];

    // Calculate unread count (messages received since last popup open)
    const unreadCount = newMails.length + state.unreadCount;

    await setState({
      messages,
      seenIds: updatedSeenIds,
      unreadCount: Math.max(0, unreadCount),
    });

    updateBadge(unreadCount);
  } catch (err) {
    console.error("[TempAdd] Poll error:", err.message);
  }
}

/* ---------- Alarms ---------- */

function ensureAlarm() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: ALARM_PERIOD,
        periodInMinutes: ALARM_PERIOD,
      });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollInbox();
  }
});

/* ---------- Notification click ---------- */

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("tempadd-mail-")) {
    // Open the popup by focusing the extension
    chrome.action.openPopup().catch(() => {
      // Fallback: open popup.html in a new tab if openPopup is not available
      chrome.tabs.create({
        url: chrome.runtime.getURL("popup/popup.html"),
      });
    });
  }
  chrome.notifications.clear(notificationId);
});

/* ---------- Message handler ---------- */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = async () => {
    switch (message.action) {
      case "getState": {
        const state = await getState();
        // Also compute remaining time
        const remaining = Math.max(
          0,
          API.MAILBOX_LIFETIME_MS - (Date.now() - state.createdAt)
        );
        return { ...state, remaining, lifetime: API.MAILBOX_LIFETIME_MS };
      }

      case "createMailbox": {
        const result = await createNewMailbox();
        if (result.success) {
          await pollInbox();
        }
        return result;
      }

      case "refreshInbox": {
        await pollInbox();
        const state = await getState();
        return { messages: state.messages };
      }

      case "getMessageBody": {
        const state = await getState();
        if (!state.token || !message.id) return null;
        const body = await API.fetchMessageBody(state.token, message.id);
        return body;
      }

      case "clearUnread": {
        await setState({ unreadCount: 0 });
        updateBadge(0);
        return { success: true };
      }

      case "copyEmail": {
        // Background cannot access clipboard directly,
        // but we return the email for the caller to copy
        const state = await getState();
        return { email: state.email };
      }

      default:
        return { error: "Unknown action" };
    }
  };

  handler()
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));

  return true; // Keep the message channel open for async response
});

/* ---------- Install / Startup ---------- */

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TempAdd] Extension installed");
  const state = await getState();

  if (!state.email || !state.token) {
    await createNewMailbox();
  } else {
    // Verify existing session is still valid
    const elapsed = Date.now() - state.createdAt;
    if (elapsed >= API.MAILBOX_LIFETIME_MS) {
      await createNewMailbox();
    } else {
      ensureAlarm();
      updateBadge(state.unreadCount);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[TempAdd] Browser started — generating fresh mailbox");
  await createNewMailbox();
});
