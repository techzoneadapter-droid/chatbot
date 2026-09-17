"use strict";

const { app, webContents } = require("electron");

const ACTIVE_FPS = 24;
const BACKGROUND_FPS = 8;
const performanceSessions = new WeakSet();

function installMediaFilter(ses) {
  if (!ses || performanceSessions.has(ses)) return;
  performanceSessions.add(ses);
  try {
    ses.webRequest.onBeforeRequest((details, callback) => {
      const url = String(details.url || "");
      const heavyMedia =
        details.resourceType === "media" ||
        /\.(?:mp4|m4v|webm|mov|avi)(?:\?|$)/i.test(url);
      callback({ cancel: heavyMedia });
    });
  } catch {}
}

function setContentsFrameRate(contents, focused = true) {
  if (!contents || contents.isDestroyed?.() || contents.getType?.() === "window") return;
  try { contents.setFrameRate?.(focused ? ACTIVE_FPS : BACKGROUND_FPS); } catch {}
}

function tuneAllEmbeddedContents(focused) {
  for (const contents of webContents.getAllWebContents()) {
    setContentsFrameRate(contents, focused);
  }
}

// Apply lightweight tuning before the first remote page request. This avoids
// downloading/decoding autoplay video in Facebook/Meta views on slower PCs.
app.on("web-contents-created", (_event, contents) => {
  if (!contents || contents.getType() === "window") return;
  installMediaFilter(contents.session);
  setContentsFrameRate(contents, true);
});

// Lower renderer work while PageBot is in the background, then restore a smooth
// but cheaper frame rate when the user comes back.
app.on("browser-window-created", (_event, win) => {
  win.on("focus", () => tuneAllEmbeddedContents(true));
  win.on("blur", () => tuneAllEmbeddedContents(false));
  win.on("minimize", () => tuneAllEmbeddedContents(false));
  win.on("restore", () => tuneAllEmbeddedContents(win.isFocused()));
});
