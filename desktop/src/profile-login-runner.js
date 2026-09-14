"use strict";

const { app, BrowserWindow, ipcMain, safeStorage, session, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
}

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), "utf8"));
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
    };
  } catch {
    return { profiles: [], secrets: {} };
  }
}

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}

function facebookLoginSecretKey(profileId) {
  return `facebook-login:${profileId}`;
}

function readFacebookLogin(profileId, data = loadData()) {
  const encrypted = data.secrets?.[facebookLoginSecretKey(profileId)];
  if (!encrypted) return { account: "", password: "" };
  try {
    const parsed = JSON.parse(decryptSecret(encrypted) || "{}");
    return {
      account: String(parsed?.account || "").trim().slice(0, 320),
      password: String(parsed?.password || "").slice(0, 512)
    };
  } catch {
    return { account: "", password: "" };
  }
}

function normalizedStoragePath(ses) {
  try {
    const value = String(ses?.storagePath || "").trim();
    return value ? path.resolve(value).toLowerCase() : "";
  } catch {
    return "";
  }
}

function belongsToProfile(contents, targetSession) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    if (contents.session === targetSession) return true;
    const actualPath = normalizedStoragePath(contents.session);
    const targetPath = normalizedStoragePath(targetSession);
    return Boolean(actualPath && targetPath && actualPath === targetPath);
  } catch {
    return false;
  }
}

function embeddedBrowserContents() {
  const windows = [
    BrowserWindow.getFocusedWindow(),
    ...BrowserWindow.getAllWindows()
  ].filter(Boolean);

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
        if (/https?:\/\/(?:[^/]+\.)?(?:facebook\.com|meta\.com)(?:\/|$)/i.test(url)) return contents;
      }
    } catch {}
  }
  return null;
}

function findProfileWebContents(profileId) {
  const targetSession = session.fromPartition(`persist:pagebot-${profileId}`);
  const candidates = webContents.getAllWebContents().filter((contents) => {
    try {
      return !contents.isDestroyed() && contents !== BrowserWindow.getAllWindows().find((win) => win.webContents?.id === contents.id)?.webContents;
    } catch {
      return false;
    }
  });

  const exact = candidates.find((contents) => belongsToProfile(contents, targetSession));
  if (exact) return exact;

  // WebContentsView changed type/session wrapper behavior across Electron versions.
  // PageBot only keeps one embedded profile browser visible at a time, so the
  // currently visible Facebook/Meta view is the safest fallback for the active UI profile.
  const embedded = embeddedBrowserContents();
  if (embedded && !embedded.isDestroyed()) return embedded;
  return null;
}

function facebookLoginScript(account, password, twoFactorCode) {
  return `(() => {
    const account = ${JSON.stringify(account)};
    const password = ${JSON.stringify(password)};
    const code = ${JSON.stringify(twoFactorCode)};
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const setValue = (el, value) => {
      if (!el) return;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const clickSubmit = (keywords) => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).filter(visible);
      const hit = buttons.find((el) => {
        const label = [el.innerText, el.value, el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' ');
        return keywords.test(label);
      }) || buttons.find((el) => el.tagName === 'INPUT' && el.type === 'submit');
      if (hit) { hit.click(); return true; }
      return false;
    };

    const otp = Array.from(document.querySelectorAll('input[autocomplete="one-time-code"], input[name="approvals_code"], input[name="code"], input[inputmode="numeric"]')).find(visible);
    if (otp) {
      if (!code) return { stage: 'two_factor_required', url: location.href };
      setValue(otp, code);
      clickSubmit(/continue|tiếp tục|submit|xác nhận|confirm|login|đăng nhập/i);
      return { stage: 'two_factor_submitted', url: location.href };
    }

    const email = Array.from(document.querySelectorAll('input[name="email"], input#email, input[type="email"], input[autocomplete="username"]')).find(visible);
    const pass = Array.from(document.querySelectorAll('input[name="pass"], input#pass, input[type="password"], input[autocomplete="current-password"]')).find(visible);
    if (email && pass) {
      setValue(email, account);
      setValue(pass, password);
      clickSubmit(/log in|login|đăng nhập|continue|tiếp tục/i);
      return { stage: 'credentials_submitted', url: location.href };
    }

    if (/facebook\.com$/i.test(location.hostname) || /\.facebook\.com$/i.test(location.hostname)) {
      return { stage: 'no_login_form', url: location.href };
    }
    return { stage: 'manual_required', url: location.href };
  })()`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFacebookLogin(profileId, input = {}) {
  const data = loadData();
  if (!data.profiles.some((profile) => profile.id === profileId)) throw new Error("Profile không tồn tại.");

  let contents = findProfileWebContents(profileId);
  if (!contents) {
    await wait(180);
    contents = findProfileWebContents(profileId);
  }
  if (!contents) throw new Error("Không tìm thấy trình duyệt của profile đang mở. Hãy bấm profile một lần rồi thử lại.");

  const saved = readFacebookLogin(profileId, data);
  const account = String(input.account || saved.account || "").trim().slice(0, 320);
  const password = String(input.password || saved.password || "").slice(0, 512);
  const twoFactorCode = String(input.twoFactorCode || "").replace(/\s+/g, "").slice(0, 16);
  if (!account) throw new Error("Hãy nhập tài khoản Facebook.");
  if (!password) throw new Error("Hãy nhập mật khẩu Facebook.");

  const currentUrl = String(contents.getURL() || "");
  if (!/facebook\.com/i.test(currentUrl)) {
    await contents.loadURL("https://www.facebook.com/login/");
  }

  let result = await contents.executeJavaScript(facebookLoginScript(account, password, twoFactorCode), true);
  if (result?.stage === "credentials_submitted") {
    await wait(2600);
    if (contents.isDestroyed()) throw new Error("Cửa sổ profile đã đóng.");
    result = await contents.executeJavaScript(facebookLoginScript(account, password, twoFactorCode), true);
  } else if (result?.stage === "no_login_form" && /login|checkpoint|two_step|two-factor/i.test(String(contents.getURL() || ""))) {
    await wait(900);
    result = await contents.executeJavaScript(facebookLoginScript(account, password, twoFactorCode), true);
  }

  return {
    ok: true,
    stage: result?.stage || "manual_required",
    requiresTwoFactor: result?.stage === "two_factor_required",
    url: String(contents.getURL() || result?.url || "")
  };
}

app.whenReady().then(() => {
  // bootstrap.js registers the original handler first. Replace only this one
  // handler so saved-login/proxy/AI behavior elsewhere remains untouched.
  ipcMain.removeHandler("profile-login:run");
  ipcMain.handle("profile-login:run", (_event, profileId, input) => runFacebookLogin(profileId, input || {}));
});
