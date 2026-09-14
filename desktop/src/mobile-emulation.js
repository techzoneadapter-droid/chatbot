"use strict";

const { BrowserWindow, ipcMain } = require("electron");

const MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const originalUserAgentByContentsId = new Map();
const enabledContentsIds = new Set();

function embeddedBrowserContents() {
  const windows = [BrowserWindow.getFocusedWindow(), ...BrowserWindow.getAllWindows()].filter(Boolean);
  const seen = new Set();
  for (const win of windows) {
    if (!win || win.isDestroyed() || seen.has(win.id)) continue;
    seen.add(win.id);
    try {
      const children = Array.isArray(win.contentView?.children) ? win.contentView.children : [];
      for (const child of children) {
        const contents = child?.webContents;
        if (!contents || contents.isDestroyed()) continue;
        const url = String(contents.getURL() || "");
        if (/^https?:\/\//i.test(url)) return contents;
      }
    } catch {}
  }
  return null;
}

function isMobile(contents) {
  if (!contents || contents.isDestroyed()) return false;
  if (enabledContentsIds.has(contents.id)) return true;
  try {
    return /Android|iPhone|Mobile/i.test(String(contents.getUserAgent() || ""));
  } catch {
    return false;
  }
}

function applyDeviceEmulation(contents) {
  try {
    if (typeof contents.enableDeviceEmulation === "function") {
      contents.enableDeviceEmulation({
        screenPosition: "mobile",
        screenSize: { width: 412, height: 915 },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: 2.625,
        viewSize: { width: 412, height: 915 },
        scale: 1
      });
      return true;
    }
  } catch {}
  return false;
}

function clearDeviceEmulation(contents) {
  try {
    if (typeof contents.disableDeviceEmulation === "function") contents.disableDeviceEmulation();
  } catch {}
}

async function setMobile(enabled) {
  const contents = embeddedBrowserContents();
  if (!contents) throw new Error("Hãy mở một profile trước khi bật giả lập mobile.");

  const next = Boolean(enabled);
  if (next) {
    if (!originalUserAgentByContentsId.has(contents.id)) {
      originalUserAgentByContentsId.set(contents.id, String(contents.getUserAgent() || ""));
    }
    contents.setUserAgent(MOBILE_USER_AGENT);
    applyDeviceEmulation(contents);
    enabledContentsIds.add(contents.id);
  } else {
    clearDeviceEmulation(contents);
    const original = originalUserAgentByContentsId.get(contents.id);
    if (original) contents.setUserAgent(original);
    originalUserAgentByContentsId.delete(contents.id);
    enabledContentsIds.delete(contents.id);
  }

  try {
    contents.reloadIgnoringCache();
  } catch {
    try { contents.reload(); } catch {}
  }

  return {
    enabled: next,
    available: true,
    device: next ? "Pixel 7 · Android 14" : "Desktop"
  };
}

ipcMain.handle("browser:mobile-emulation:state", () => {
  const contents = embeddedBrowserContents();
  return {
    enabled: isMobile(contents),
    available: Boolean(contents),
    device: isMobile(contents) ? "Pixel 7 · Android 14" : "Desktop"
  };
});

ipcMain.handle("browser:mobile-emulation:set", (_event, enabled) => setMobile(enabled));

ipcMain.on("browser:mobile-emulation:reset", () => {
  const contents = embeddedBrowserContents();
  if (!contents) return;
  enabledContentsIds.delete(contents.id);
  originalUserAgentByContentsId.delete(contents.id);
});
