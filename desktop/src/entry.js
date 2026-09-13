const { app } = require("electron");

// Keep Chromium startup lean. No browser profile, proxy, AI request or chat scan
// is started from this entry point.
app.commandLine.appendSwitch(
  "disable-features",
  "WebAuthentication,WebAuthenticationConditionalUI"
);

app.on("browser-window-created", (_event, window) => {
  try { window.setBackgroundColor("#f4f7fb"); } catch {}
});

// main.js still owns the original Auto loop. This guard captures that timer and
// prevents it from running unless an Auto mode explicitly enables it.
require("./legacy-auto-guard");

// bootstrap registers the lightweight IPC surface and then loads main.js.
// No duplicate chat runtime is loaded at startup anymore.
require("./bootstrap");
