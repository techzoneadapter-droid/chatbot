"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");

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
  try { return /Android|iPhone|Mobile/i.test(String(contents.getUserAgent() || "")); }
  catch { return false; }
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

function updateToolbarButton(win, enabled, available = true) {
  if (!win || win.isDestroyed()) return;
  const script = `(() => {
    const button = document.getElementById('mobile-emulation');
    if (!button) return false;
    const enabled = ${enabled ? "true" : "false"};
    button.dataset.active = enabled ? '1' : '0';
    button.disabled = ${available ? "false" : "true"};
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.title = enabled ? 'Tắt giả lập mobile' : 'Bật giả lập mobile (Pixel 7)';
    button.style.background = enabled ? '#e8f1ff' : '';
    button.style.borderColor = enabled ? '#7da7e8' : '';
    button.style.color = enabled ? '#155bb5' : '';
    return true;
  })()`;
  win.webContents.executeJavaScript(script, true).catch(() => {});
}

function installToolbarButton(win) {
  if (!win || win.isDestroyed()) return;
  const script = `(() => {
    if (document.getElementById('mobile-emulation')) return true;
    const host = document.querySelector('.nav-buttons');
    if (!host) return false;
    const button = document.createElement('button');
    button.id = 'mobile-emulation';
    button.type = 'button';
    button.textContent = '📱';
    button.title = 'Bật giả lập mobile (Pixel 7)';
    button.setAttribute('aria-label', 'Bật giả lập mobile');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const next = button.dataset.active === '1' ? '0' : '1';
      location.href = 'pagebot-mobile://toggle?enabled=' + next;
    });
    host.appendChild(button);
    return true;
  })()`;
  win.webContents.executeJavaScript(script, true).then(() => {
    const contents = embeddedBrowserContents();
    updateToolbarButton(win, isMobile(contents), Boolean(contents));
  }).catch(() => {});
}

async function setMobile(enabled) {
  const contents = embeddedBrowserContents();
  if (!contents) return { enabled: false, available: false };

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

  try { contents.reloadIgnoringCache(); } catch { try { contents.reload(); } catch {} }
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  updateToolbarButton(win, next, true);
  return { enabled: next, available: true, device: next ? "Pixel 7 · Android 14" : "Desktop" };
}

ipcMain.handle("browser:mobile-emulation:state", () => {
  const contents = embeddedBrowserContents();
  return { enabled: isMobile(contents), available: Boolean(contents) };
});
ipcMain.handle("browser:mobile-emulation:set", (_event, enabled) => setMobile(enabled));

app.on("browser-window-created", (_event, win) => {
  win.webContents.on("dom-ready", () => installToolbarButton(win));
  win.webContents.on("will-navigate", (event, url) => {
    if (!String(url || "").startsWith("pagebot-mobile://toggle")) return;
    event.preventDefault();
    let enabled = false;
    try { enabled = new URL(url).searchParams.get("enabled") === "1"; } catch {}
    void setMobile(enabled);
  });
});

app.on("web-contents-created", (_event, contents) => {
  if (!contents || contents.getType() === "window") return;
  const reset = () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    updateToolbarButton(win, false, true);
  };
  contents.once("did-finish-load", reset);
  contents.once("destroyed", () => {
    originalUserAgentByContentsId.delete(contents.id);
    enabledContentsIds.delete(contents.id);
  });
});
