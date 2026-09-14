"use strict";

const { app } = require("electron");

const LOAD_WATCHDOG_MS = 18000;

app.on("web-contents-created", (_event, contents) => {
  if (!contents || contents.getType() === "window") return;

  try { contents.setFrameRate?.(30); } catch {}

  let watchdog = null;
  let retriedThisLoad = false;

  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  };

  const armWatchdog = () => {
    clearWatchdog();
    retriedThisLoad = false;
    watchdog = setTimeout(() => {
      watchdog = null;
      if (retriedThisLoad || contents.isDestroyed() || !contents.isLoading()) return;
      const url = String(contents.getURL() || "");
      if (!/https?:\/\/([^/]+\.)?(facebook|meta)\.com\//i.test(url)) return;
      retriedThisLoad = true;
      try {
        contents.stop();
        contents.reloadIgnoringCache();
      } catch {}
    }, LOAD_WATCHDOG_MS);
  };

  contents.on("did-start-loading", armWatchdog);
  contents.on("dom-ready", clearWatchdog);
  contents.on("did-stop-loading", clearWatchdog);
  contents.on("destroyed", clearWatchdog);
});
