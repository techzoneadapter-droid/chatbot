// The original main.js owns a 2.5s Auto Chat loop that scans the Facebook DOM.
// New Auto Chat is renderer-driven and starts only after the user enables it.
// Suppress only that exact legacy interval so it cannot freeze the embedded page
// or race with the newer Auto Chat flow. All other timers remain untouched.
const nativeSetInterval = global.setInterval.bind(global);
const nativeClearInterval = global.clearInterval.bind(global);

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

global.setInterval = function pageBotSetInterval(callback, delay, ...args) {
  const source = typeof callback === "function"
    ? Function.prototype.toString.call(callback)
    : "";
  if (Number(delay) === 2500 && /\bautoTick\b/.test(source)) {
    return disabledHandle();
  }
  return nativeSetInterval(callback, delay, ...args);
};

global.clearInterval = function pageBotClearInterval(handle) {
  if (handle?.__pagebotLegacyAutoDisabled) return;
  return nativeClearInterval(handle);
};
