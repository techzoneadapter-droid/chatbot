const crypto = require("node:crypto");

const DEFAULT_START_URL = "https://business.facebook.com/latest/inbox";

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_START_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isSupportedChatUrl(value) {
  try {
    const url = new URL(normalizeUrl(value));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === "business.facebook.com") return path.includes("/latest/inbox");
    if (host === "www.messenger.com" || host === "messenger.com") return true;
    if (host === "www.facebook.com" || host === "facebook.com") return path.startsWith("/messages");
    return false;
  } catch {
    return false;
  }
}

function cleanUserAgent(userAgent) {
  return String(userAgent || "")
    .replace(/\sElectron\/[^\s]+/gi, "")
    .replace(/\sPageBotDesktop\/[^\s]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function snapshotSignature(snapshot) {
  if (!snapshot) return "";
  const recent = Array.isArray(snapshot.messages)
    ? snapshot.messages.slice(-4).map((item) => `${item.direction || "unknown"}:${String(item.text || "").trim()}`).join("|")
    : Array.isArray(snapshot.history)
      ? snapshot.history.slice(-4).join("|")
      : "";
  const raw = [snapshot.conversationKey || "", snapshot.latestText || "", snapshot.incoming ? "in" : "out", recent].join("||");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function boundedText(value, max = 2000) {
  const text = String(value || "").replace(/\u0000/g, "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

module.exports = {
  DEFAULT_START_URL,
  normalizeUrl,
  isSupportedChatUrl,
  cleanUserAgent,
  snapshotSignature,
  boundedText
};
