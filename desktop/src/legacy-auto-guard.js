const { app, ipcMain } = require("electron");

// main.js still contains the original 2.5s Auto Chat loop. Keep its callback,
// but do not schedule it unless the user explicitly selects the legacy engine
// from the Chatbot panel. This guarantees zero legacy polling while it is off
// or while the lightweight engine is selected.
const nativeSetInterval = global.setInterval.bind(global);
const nativeClearInterval = global.clearInterval.bind(global);

let capturedLegacy = null;
let activeLegacyTimer = null;
let legacyEnabled = false;

function disabledHandle() {
  return {
    __pagebotLegacyAutoDisabled: true,
    ref() { return this; },
    unref() { return this; },
    refresh() { return this; },
    hasRef() { return false; },
    [Symbol.toPrimitive]() { return 0; }
  };
}

function stopLegacyTimer() {
  if (activeLegacyTimer) nativeClearInterval(activeLegacyTimer);
  activeLegacyTimer = null;
}

function startLegacyTimerIfReady() {
  stopLegacyTimer();
  if (!legacyEnabled || !capturedLegacy?.callback) return false;
  activeLegacyTimer = nativeSetInterval(
    capturedLegacy.callback,
    capturedLegacy.delay,
    ...(capturedLegacy.args || [])
  );
  return true;
}

global.setInterval = function pageBotSetInterval(callback, delay, ...args) {
  const source = typeof callback === "function"
    ? Function.prototype.toString.call(callback)
    : "";
  if (Number(delay) === 2500 && /\bautoTick\b/.test(source)) {
    capturedLegacy = { callback, delay: Number(delay), args };
    startLegacyTimerIfReady();
    return disabledHandle();
  }
  return nativeSetInterval(callback, delay, ...args);
};

global.clearInterval = function pageBotClearInterval(handle) {
  if (handle?.__pagebotLegacyAutoDisabled) {
    stopLegacyTimer();
    return;
  }
  return nativeClearInterval(handle);
};

ipcMain.handle("legacy-auto:set-enabled", (_event, enabled) => {
  legacyEnabled = Boolean(enabled);
  if (legacyEnabled) startLegacyTimerIfReady();
  else stopLegacyTimer();
  return {
    enabled: legacyEnabled,
    running: Boolean(activeLegacyTimer),
    ready: Boolean(capturedLegacy?.callback)
  };
});

ipcMain.handle("legacy-auto:status", () => ({
  enabled: legacyEnabled,
  running: Boolean(activeLegacyTimer),
  ready: Boolean(capturedLegacy?.callback)
}));

app.on("before-quit", stopLegacyTimer);
