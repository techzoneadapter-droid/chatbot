const { app, ipcMain, session } = require("electron");

app.commandLine.appendSwitch(
  "disable-features",
  "WebAuthentication,WebAuthenticationConditionalUI"
);

app.on("browser-window-created", (_event, window) => {
  try { window.setBackgroundColor("#f7f9fc"); } catch {}
});

const nativeFetch = globalThis.fetch?.bind(globalThis);
// 429 is deliberately NOT retried here. The Auto Sales engine reads the
// provider's retry window and pauses all AI work instead of creating a retry storm.
const RETRYABLE_AI_STATUS = new Set([500, 502, 503, 504]);
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

// Keep the old Auto loop fully disarmed unless the user explicitly enables it.
require("./legacy-auto-guard");

// Meta Muse sales/chat runtime is loaded only when AI Chat or Auto Chat needs it.
let salesRuntimeLoading = null;
ipcMain.handle("sales:ensure-runtime", async () => {
  if (!salesRuntimeLoading) {
    salesRuntimeLoading = Promise.resolve().then(() => {
      require("./meta-sales-runtime");
      return true;
    }).catch((error) => {
      salesRuntimeLoading = null;
      throw error;
    });
  }
  return salesRuntimeLoading;
});

// The DOM chat readers are also demand-loaded on first Inspect/AI/Auto use.
let liteSnapshotLoading = null;
ipcMain.handle("chat:enable-lite-snapshot", async () => {
  if (!liteSnapshotLoading) {
    liteSnapshotLoading = Promise.resolve().then(async () => {
      require("./chat-snapshot-lite");
      require("./multi-chat-runtime");
      await wait(120);
      return true;
    }).catch((error) => {
      liteSnapshotLoading = null;
      throw error;
    });
  }
  return liteSnapshotLoading;
});

// Lightweight per-profile request filter: no polling, no network request of its own.
// It only cancels heavy video/media requests after the user opens that profile.
const performanceSessions = new WeakSet();
ipcMain.handle("profile:prepare-performance", (_event, profileId) => {
  const value = String(profileId || "");
  if (!value) return false;
  const ses = session.fromPartition(`persist:pagebot-${value}`);
  if (performanceSessions.has(ses)) return true;
  performanceSessions.add(ses);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = String(details.url || "");
    const heavyMedia = details.resourceType === "media" || /\.(?:mp4|m4v|webm|mov)(?:\?|$)/i.test(url);
    callback({ cancel: heavyMedia });
  });
  return true;
});

// Registers only local IPC handlers. electron-updater itself is required lazily on click.
require("./update-runtime");
require("./bootstrap");
// Replace only the brittle quick-login runner after bootstrap registers its handlers.
require("./profile-login-runner");
