"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");

const MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";
const MOBILE_WIDTH = 412;
const SIDEBAR_WIDTH = 260;
const AI_PANEL_WIDTH = 360;
const TOPBAR_HEIGHT = 54;

const originalUserAgentByContentsId = new Map();
const enabledContentsIds = new Set();

function embeddedBrowserTarget() {
  const windows = [BrowserWindow.getFocusedWindow(), ...BrowserWindow.getAllWindows()].filter(Boolean);
  const seen = new Set();
  for (const win of windows) {
    if (!win || win.isDestroyed() || seen.has(win.id)) continue;
    seen.add(win.id);
    try {
      const children = Array.isArray(win.contentView?.children) ? win.contentView.children : [];
      for (const view of children) {
        const contents = view?.webContents;
        if (!contents || contents.isDestroyed()) continue;
        const url = String(contents.getURL() || "");
        if (/^https?:\/\//i.test(url)) return { win, view, contents };
      }
    } catch {}
  }
  return null;
}

function embeddedBrowserContents() {
  return embeddedBrowserTarget()?.contents || null;
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

function setMobileShell(win, enabled) {
  if (!win || win.isDestroyed()) return;
  const script = `(() => {
    const enabled = ${enabled ? "true" : "false"};
    document.body.classList.toggle('mobile-emulation-active', enabled);
    let style = document.getElementById('pagebot-mobile-shell-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pagebot-mobile-shell-style';
      style.textContent = `
        body.mobile-emulation-active .workspace-empty { background: #eef2f7 !important; }
        body.mobile-emulation-active .workspace-empty-card { display: none !important; }
      `;
      document.head.appendChild(style);
    }
    return true;
  })()`;
  win.webContents.executeJavaScript(script, true).catch(() => {});
}

function applyMobileBounds(win, view) {
  if (!win || win.isDestroyed() || !view) return;
  try {
    const [contentWidth, contentHeight] = win.getContentSize();
    const availableWidth = Math.max(320, contentWidth - SIDEBAR_WIDTH - AI_PANEL_WIDTH);
    const width = Math.min(MOBILE_WIDTH, availableWidth);
    const x = SIDEBAR_WIDTH + Math.max(0, Math.floor((availableWidth - width) / 2));
    view.setBounds({
      x,
      y: TOPBAR_HEIGHT,
      width,
      height: Math.max(300, contentHeight - TOPBAR_HEIGHT)
    });
  } catch {}
}

function restoreDesktopBounds(win, view) {
  if (!win || win.isDestroyed() || !view) return;
  try {
    const [contentWidth, contentHeight] = win.getContentSize();
    view.setBounds({
      x: SIDEBAR_WIDTH,
      y: TOPBAR_HEIGHT,
      width: Math.max(320, contentWidth - SIDEBAR_WIDTH - AI_PANEL_WIDTH),
      height: Math.max(300, contentHeight - TOPBAR_HEIGHT)
    });
  } catch {}
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
  const target = embeddedBrowserTarget();
  if (!target) throw new Error("Hãy mở một profile trước khi bật giả lập mobile.");

  const { win, view, contents } = target;
  const next = Boolean(enabled);
  if (next) {
    if (!originalUserAgentByContentsId.has(contents.id)) {
      originalUserAgentByContentsId.set(contents.id, String(contents.getUserAgent() || ""));
    }
    contents.setUserAgent(MOBILE_USER_AGENT);
    applyDeviceEmulation(contents);
    enabledContentsIds.add(contents.id);
    setMobileShell(win, true);
    applyMobileBounds(win, view);
  } else {
    clearDeviceEmulation(contents);
    const original = originalUserAgentByContentsId.get(contents.id);
    if (original) contents.setUserAgent(original);
    originalUserAgentByContentsId.delete(contents.id);
    enabledContentsIds.delete(contents.id);
    setMobileShell(win, false);
    restoreDesktopBounds(win, view);
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

function installToolbarButton(win) {
  if (!win || win.isDestroyed()) return;
  const script = `(() => {
    if (document.getElementById('mobile-emulation')) return true;
    const host = document.querySelector('.nav-buttons');
    if (!host || !window.pagebot?.browser?.setMobile) return false;
    const button = document.createElement('button');
    button.id = 'mobile-emulation';
    button.type = 'button';
    button.textContent = '📱';
    button.dataset.active = '0';
    button.title = 'Bật giả lập mobile (Pixel 7)';
    button.setAttribute('aria-label', 'Bật giả lập mobile');
    button.setAttribute('aria-pressed', 'false');

    const paint = (enabled) => {
      button.dataset.active = enabled ? '1' : '0';
      button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      button.title = enabled ? 'Tắt giả lập mobile' : 'Bật giả lập mobile (Pixel 7)';
      button.style.background = enabled ? '#e8f1ff' : '';
      button.style.borderColor = enabled ? '#7da7e8' : '';
      button.style.color = enabled ? '#155bb5' : '';
    };

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const next = button.dataset.active !== '1';
        const result = await window.pagebot.browser.setMobile(next);
        paint(Boolean(result?.enabled));
      } catch (error) {
        console.error('Mobile emulation toggle failed', error);
      } finally {
        button.disabled = false;
      }
    });

    host.appendChild(button);
    window.pagebot.browser.mobileState?.().then((state) => paint(Boolean(state?.enabled))).catch(() => {});
    return true;
  })()`;
  win.webContents.executeJavaScript(script, true).catch(() => {});
}

app.on("browser-window-created", (_event, win) => {
  win.webContents.on("dom-ready", () => installToolbarButton(win));
  win.on("resize", () => {
    const target = embeddedBrowserTarget();
    if (!target || target.win !== win || !isMobile(target.contents)) return;
    applyMobileBounds(target.win, target.view);
  });
});

app.on("web-contents-created", (_event, contents) => {
  contents.once("destroyed", () => {
    originalUserAgentByContentsId.delete(contents.id);
    enabledContentsIds.delete(contents.id);
  });
});
