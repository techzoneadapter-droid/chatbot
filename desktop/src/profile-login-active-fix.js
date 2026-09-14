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

function readFacebookLogin(profileId, data = loadData()) {
  const encrypted = data.secrets?.[`facebook-login:${profileId}`];
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

function sameSession(contents, targetSession) {
  try {
    if (!contents || contents.isDestroyed()) return false;
    if (contents.session === targetSession) return true;
    const actual = normalizedStoragePath(contents.session);
    const expected = normalizedStoragePath(targetSession);
    return Boolean(actual && expected && actual === expected);
  } catch {
    return false;
  }
}

function isFacebookView(contents) {
  try {
    if (!contents || contents.isDestroyed()) return false;
    return /https?:\/\/(?:[^/]+\.)?(?:facebook\.com|meta\.com)(?:\/|$)/i.test(String(contents.getURL() || ""));
  } catch {
    return false;
  }
}

function visibleEmbeddedViews() {
  const results = [];
  const seen = new Set();
  const windows = [BrowserWindow.getFocusedWindow(), ...BrowserWindow.getAllWindows()].filter(Boolean);
  for (const win of windows) {
    if (!win || win.isDestroyed() || seen.has(win.id)) continue;
    seen.add(win.id);
    try {
      const children = Array.isArray(win.contentView?.children) ? win.contentView.children : [];
      for (const child of children) {
        const contents = child?.webContents;
        if (contents && !contents.isDestroyed()) results.push(contents);
      }
    } catch {}
  }
  return results;
}

function findProfileWebContents(profileId) {
  const targetSession = session.fromPartition(`persist:pagebot-${profileId}`);
  const all = webContents.getAllWebContents().filter((contents) => {
    try { return contents && !contents.isDestroyed(); } catch { return false; }
  });

  const exact = all.find((contents) => sameSession(contents, targetSession) && isFacebookView(contents));
  if (exact) return exact;

  const embedded = visibleEmbeddedViews();
  const embeddedExact = embedded.find((contents) => sameSession(contents, targetSession));
  if (embeddedExact) return embeddedExact;

  // PageBot only displays one embedded profile browser at a time. Electron versions
  // differ in how WebContentsView exposes its Session wrapper, so use the visible
  // Facebook/Meta view as a final safe fallback for the profile currently selected.
  const visibleFacebook = embedded.find(isFacebookView);
  if (visibleFacebook) return visibleFacebook;

  return all.find((contents) => {
    try { return contents.getType() !== "window" && isFacebookView(contents); } catch { return false; }
  }) || null;
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

async function resolveProfileContents(profileId) {
  for (const delay of [0, 180, 420]) {
    if (delay) await wait(delay);
    const found = findProfileWebContents(profileId);
    if (found) return found;
  }
  return null;
}

async function runFacebookLogin(profileId, input = {}) {
  const data = loadData();
  if (!data.profiles.some((profile) => profile.id === profileId)) throw new Error("Profile không tồn tại.");

  const contents = await resolveProfileContents(profileId);
  if (!contents) throw new Error("Không tìm thấy trang Facebook đang hiển thị của profile này. Hãy bấm lại profile rồi thử Đăng nhập.");

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
  // bootstrap.js and profile-login-runner.js both register this channel. Replace it
  // one last time after those modules are initialized so the active WebContentsView
  // used by the installed Electron build is always detected correctly.
  setImmediate(() => {
    ipcMain.removeHandler("profile-login:run");
    ipcMain.handle("profile-login:run", (_event, profileId, input) => runFacebookLogin(profileId, input || {}));
  });
});
