const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.commandLine.appendSwitch(
  "disable-features",
  "WebAuthentication,WebAuthenticationConditionalUI"
);

app.on("browser-window-created", (_event, window) => {
  try { window.setBackgroundColor("#f7f9fc"); } catch {}
});

function resetManualRuntimeSwitches() {
  try {
    const file = path.join(app.getPath("userData"), "pagebot-data.json");
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data?.profiles)) return;
    let changed = false;
    for (const profile of data.profiles) {
      if (profile?.proxy?.enabled) {
        profile.proxy.enabled = false;
        changed = true;
      }
      if (profile?.autoReply) {
        profile.autoReply = false;
        changed = true;
      }
      if (profile?.startUrl && profile?.lastUrl && profile.lastUrl !== profile.startUrl) {
        profile.lastUrl = profile.startUrl;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch {}
}

app.whenReady().then(resetManualRuntimeSwitches);

const nativeFetch = globalThis.fetch?.bind(globalThis);
const RETRYABLE_AI_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_AI_ATTEMPTS = 3;

function isAIEndpoint(input) {
  const value = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname === "generativelanguage.googleapis.com" || url.hostname === "api.meta.ai";
  } catch {
    return false;
  }
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number.parseFloat(response?.headers?.get?.("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(5000, Math.round(retryAfter * 1000));
  const base = attempt === 1 ? 650 : 1400;
  return base + Math.floor(Math.random() * 220);
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("aborted"));
    }, { once: true });
  });
}

if (nativeFetch) {
  globalThis.fetch = async function pageBotFetch(input, init = {}) {
    if (!isAIEndpoint(input)) return nativeFetch(input, init);
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt += 1) {
      try {
        const response = await nativeFetch(input, init);
        if (!RETRYABLE_AI_STATUS.has(response.status) || attempt === MAX_AI_ATTEMPTS) return response;
        await wait(retryDelayMs(response, attempt), init?.signal);
      } catch (error) {
        lastError = error;
        if (error?.name === "AbortError" || init?.signal?.aborted || attempt === MAX_AI_ATTEMPTS) throw error;
        await wait(attempt === 1 ? 500 : 1100, init?.signal);
      }
    }
    if (lastError) throw lastError;
    return nativeFetch(input, init);
  };
}

require("./legacy-auto-guard");
require("./bootstrap");
require("./chat-runtime");
require("./chat-snapshot-lite");
