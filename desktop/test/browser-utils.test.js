const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_START_URL,
  DEFAULT_SEARCH_URL,
  normalizeUrl,
  isSupportedChatUrl,
  cleanUserAgent,
  snapshotSignature,
  boundedText
} = require("../src/browser-utils");

test("normalizeUrl uses Business Suite inbox by default", () => {
  assert.equal(normalizeUrl(""), DEFAULT_START_URL);
  assert.equal(normalizeUrl("business.facebook.com/latest/inbox"), "https://business.facebook.com/latest/inbox");
});

test("normalizeUrl behaves like a browser omnibox", () => {
  assert.equal(normalizeUrl("facebook.com"), "https://facebook.com");
  assert.equal(normalizeUrl("example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(normalizeUrl("https://messenger.com"), "https://messenger.com");
  assert.equal(normalizeUrl("cách chạy quảng cáo facebook"), `${DEFAULT_SEARCH_URL}${encodeURIComponent("cách chạy quảng cáo facebook")}`);
});

test("supported chat URL guard only allows Messenger chat surfaces", () => {
  assert.equal(isSupportedChatUrl("https://business.facebook.com/latest/inbox/all"), true);
  assert.equal(isSupportedChatUrl("https://messenger.com/t/123"), true);
  assert.equal(isSupportedChatUrl("https://www.facebook.com/messages/t/123"), true);
  assert.equal(isSupportedChatUrl("https://www.facebook.com/marketplace"), false);
  assert.equal(isSupportedChatUrl("https://example.com"), false);
});

test("cleanUserAgent removes Electron markers but preserves Chromium UA", () => {
  const value = cleanUserAgent("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Electron/40.0.0 PageBotDesktop/0.1.0");
  assert.equal(value.includes("Electron/"), false);
  assert.equal(value.includes("PageBotDesktop/"), false);
  assert.equal(value.includes("Chrome/140.0.0.0"), true);
});

test("snapshotSignature changes when conversation or direction changes", () => {
  const base = { conversationKey: "chat-a", latestText: "Xin chào", incoming: true, messages: [{ direction: "incoming", text: "Xin chào" }] };
  const same = { ...base };
  const otherChat = { ...base, conversationKey: "chat-b" };
  const outgoing = { ...base, incoming: false, messages: [{ direction: "outgoing", text: "Xin chào" }] };
  assert.equal(snapshotSignature(base), snapshotSignature(same));
  assert.notEqual(snapshotSignature(base), snapshotSignature(otherChat));
  assert.notEqual(snapshotSignature(base), snapshotSignature(outgoing));
});

test("boundedText trims and caps payloads", () => {
  assert.equal(boundedText("  hello  ", 10), "hello");
  assert.equal(boundedText("abcdefgh", 4), "abcd");
});
