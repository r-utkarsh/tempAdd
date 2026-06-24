/* ===== TempAdd Flux — Shared API Module (mail.tm) ===== */

const API = (() => {
  "use strict";

  const URL_DOMAIN = "https://api.mail.tm/domains";
  const URL_ACCOUNT = "https://api.mail.tm/accounts";
  const URL_TOKEN = "https://api.mail.tm/token";
  const URL_MESSAGES = "https://api.mail.tm/messages";

  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const NAME_LEN = 13;
  const MAILBOX_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

  /* ---------- Helpers ---------- */

  async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          const backoff = delay * 2 * (i + 1);
          console.warn(`[TempAdd API] Request failed (${res.status}) on ${url}. Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        if (i === retries - 1) {
          if (err.name === "AbortError") {
            throw new Error("Request timed out after 8 seconds");
          }
          throw err;
        }
        const backoff = delay * (i + 1);
        console.warn(`[TempAdd API] Error on ${url}: ${err.message}. Retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw new Error(`Request to ${url} failed after ${retries} retries`);
  }

  function createUsername() {
    const crypt = typeof crypto !== "undefined" ? crypto : (typeof self !== "undefined" ? self.crypto : null);
    let name = "";
    const maxVal = 256 - (256 % CHARS.length); // 248 for CHARS.length = 62
    while (name.length < NAME_LEN) {
      const array = new Uint8Array(1);
      crypt.getRandomValues(array);
      const val = array[0];
      if (val < maxVal) {
        name += CHARS[val % CHARS.length];
      }
    }
    return name;
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

  /* ---------- mail.tm API ---------- */

  async function createMailbox() {
    const res = await fetchWithRetry(URL_DOMAIN);
    if (!res.ok) throw new Error(`Domain fetch failed: ${res.status}`);
    const data = await res.json();
    const domain = data["hydra:member"][0].domain;

    const email = `${createUsername()}@${domain}`.toLowerCase();
    const password = createUsername();

    const credentials = { address: email, password: password };

    const accountRes = await fetchWithRetry(URL_ACCOUNT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    const accountData = await accountRes.json();

    if (accountData.errors || accountData.violations || !accountData.id) {
      throw new Error(`Account creation failed: ${JSON.stringify(accountData)}`);
    }

    return { email, password };
  }

  async function getToken(credentials) {
    const res = await fetchWithRetry(URL_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: credentials.email,
        password: credentials.password,
      }),
    });

    const tokenData = await res.json();

    if (!tokenData.token) {
      throw new Error(`Token retrieval failed: ${JSON.stringify(tokenData)}`);
    }

    return tokenData.token;
  }

  async function fetchMessages(token) {
    const res = await fetchWithRetry(URL_MESSAGES, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data["hydra:member"] || [];
  }

  async function fetchMessageBody(token, id) {
    try {
      const res = await fetchWithRetry(`${URL_MESSAGES}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error(`[TempAdd API] Fetch message body failed: Status ${res.status}`);
        return null;
      }
      return res.json();
    } catch (err) {
      console.error("[TempAdd API] Error fetching message body:", err.message);
      return null;
    }
  }

  /* ---------- Public API ---------- */
  return {
    MAILBOX_LIFETIME_MS,
    createMailbox,
    getToken,
    fetchMessages,
    fetchMessageBody,
    escapeHtml,
    relativeTime,
  };
})();
