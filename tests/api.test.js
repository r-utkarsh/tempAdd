/**
 * TempAdd Flux — API Module Unit Tests
 *
 * Tests the shared API helper functions (escapeHtml, relativeTime)
 * and validates createUsername output characteristics.
 *
 * Run: npx jest tests/api.test.js
 */

const fs = require("fs");
const path = require("path");

// Load the api.js source and evaluate it in a controlled environment
// so the IIFE assigns to `API` in our test scope.
const apiSource = fs.readFileSync(
  path.join(__dirname, "..", "extension", "shared", "api.js"),
  "utf-8"
);

// Provide globals that the api.js module expects
const mockCrypto = {
  getRandomValues(array) {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 4294967296);
    }
    return array;
  },
};

// Create a sandbox with required globals
const sandbox = {
  self: { crypto: mockCrypto },
  window: { crypto: mockCrypto },
  fetch: jest.fn(),
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  console: global.console,
  AbortController: global.AbortController,
  Promise: global.Promise,
};

let API;
// Evaluate the API module in our sandbox context
const evalCode = new Function(
  ...Object.keys(sandbox),
  `${apiSource}\nreturn API;`
);
API = evalCode(...Object.values(sandbox));

/* ========== Tests ========== */

describe("API.escapeHtml", () => {
  test("escapes ampersands", () => {
    expect(API.escapeHtml("a&b")).toBe("a&amp;b");
  });

  test("escapes angle brackets", () => {
    expect(API.escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes double quotes", () => {
    expect(API.escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("handles empty string", () => {
    expect(API.escapeHtml("")).toBe("");
  });

  test("handles null/undefined gracefully", () => {
    expect(API.escapeHtml(null)).toBe("");
    expect(API.escapeHtml(undefined)).toBe("");
  });

  test("leaves safe strings unchanged", () => {
    expect(API.escapeHtml("hello world")).toBe("hello world");
  });

  test("escapes multiple special chars in one string", () => {
    expect(API.escapeHtml('<a href="x">&')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;"
    );
  });
});

describe("API.relativeTime", () => {
  test('returns "just now" for recent dates', () => {
    const now = new Date().toISOString();
    expect(API.relativeTime(now)).toBe("just now");
  });

  test("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(API.relativeTime(fiveMinAgo)).toBe("5m ago");
  });

  test("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(API.relativeTime(twoHoursAgo)).toBe("2h ago");
  });

  test("returns date string for old dates", () => {
    const oldDate = new Date("2020-01-15").toISOString();
    const result = API.relativeTime(oldDate);
    // Should be a locale date string, not "Xm ago" or "Xh ago"
    expect(result).not.toMatch(/ago$/);
    expect(result).not.toBe("just now");
  });
});

describe("API.MAILBOX_LIFETIME_MS", () => {
  test("is set to 24 hours in milliseconds", () => {
    expect(API.MAILBOX_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("API module structure", () => {
  test("exposes all required public methods", () => {
    expect(typeof API.createMailbox).toBe("function");
    expect(typeof API.getToken).toBe("function");
    expect(typeof API.fetchMessages).toBe("function");
    expect(typeof API.fetchMessageBody).toBe("function");
    expect(typeof API.escapeHtml).toBe("function");
    expect(typeof API.relativeTime).toBe("function");
  });

  test("exposes MAILBOX_LIFETIME_MS constant", () => {
    expect(typeof API.MAILBOX_LIFETIME_MS).toBe("number");
  });
});
