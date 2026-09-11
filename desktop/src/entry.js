const { app } = require("electron");

// Meta/Facebook can automatically trigger WebAuthn/passkey discovery on login.
// In an unsigned Electron DEV build Windows then shows the native "Making sure
// it's you / Insert your security key" dialog repeatedly. PageBot uses password,
// OTP and normal Facebook login instead, so disable WebAuthn in this embedded
// browser before Chromium starts. This prevents the OS security-key popup.
app.commandLine.appendSwitch(
  "disable-features",
  "WebAuthentication,WebAuthenticationConditionalUI"
);

// HTTP/SOCKS profiles are more predictable when Chromium does not try QUIC/UDP
// first. This avoids a noticeable failed-transport pause on some residential
// proxies before Facebook falls back to TCP/TLS.
app.commandLine.appendSwitch("disable-quic");

// Avoid the black DEV window while the renderer is still loading. The real app
// window gets a light background immediately and is revealed when its renderer
// is ready (with a safety timeout in case ready-to-show is not emitted).
app.on("browser-window-created", (_event, window) => {
  try {
    window.setBackgroundColor("#f7f9fc");
    window.hide();
    let shown = false;
    const reveal = () => {
      if (shown || window.isDestroyed()) return;
      shown = true;
      window.show();
    };
    window.once("ready-to-show", reveal);
    setTimeout(reveal, 2200).unref?.();
  } catch {}
});

// AI providers can briefly return 429/5xx while a model is overloaded. Keep this
// retry layer at the process entry point so both manual replies and Auto Chat get
// the same resilience without duplicating logic in each provider client.
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
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason || new Error("aborted"));
      }, { once: true });
    }
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

require("./bootstrap");
