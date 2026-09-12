const { app, ipcMain, session, safeStorage, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
}

function loadData() {
  try {
    const file = dataFile();
    if (!fs.existsSync(file)) return { profiles: [], secrets: {} };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
    };
  } catch {
    return { profiles: [], secrets: {} };
  }
}

function decrypt(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try { return safeStorage.decryptString(Buffer.from(value, "base64")); }
  catch { return ""; }
}

function readSavedLogin(profileId, data) {
  try {
    const encrypted = data.secrets?.[`facebook-login:${profileId}`];
    const parsed = JSON.parse(decrypt(encrypted) || "{}");
    return { account: String(parsed.account || ""), password: String(parsed.password || "") };
  } catch {
    return { account: "", password: "" };
  }
}

function findProfileContents(profileId) {
  const targetSession = session.fromPartition(`persist:pagebot-${profileId}`);
  return webContents.getAllWebContents().find((contents) => {
    try { return !contents.isDestroyed() && contents.session === targetSession; }
    catch { return false; }
  }) || null;
}

function loginScript(account, password, twoFactorCode) {
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
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const clickSubmit = (pattern) => {
      const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter(visible);
      const hit = buttons.find((el) => pattern.test([el.innerText, el.value, el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' ')))
        || buttons.find((el) => el.tagName === 'INPUT' && el.type === 'submit');
      if (hit) { hit.click(); return true; }
      return false;
    };

    const otp = Array.from(document.querySelectorAll('input[autocomplete="one-time-code"],input[name="approvals_code"],input[name="code"],input[inputmode="numeric"]')).find(visible);
    if (otp) {
      if (!code) return { stage: 'two_factor_required' };
      setValue(otp, code);
      clickSubmit(/continue|tiếp tục|submit|xác nhận|confirm|login|đăng nhập/i);
      return { stage: 'two_factor_submitted' };
    }

    const email = Array.from(document.querySelectorAll('input[name="email"],input#email,input[type="email"],input[autocomplete="username"]')).find(visible);
    const pass = Array.from(document.querySelectorAll('input[name="pass"],input#pass,input[type="password"],input[autocomplete="current-password"]')).find(visible);
    if (email && pass) {
      setValue(email, account);
      setValue(pass, password);
      clickSubmit(/log in|login|đăng nhập|continue|tiếp tục/i);
      return { stage: 'credentials_submitted' };
    }
    return { stage: 'manual_required' };
  })()`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLogin(profileId, input = {}) {
  const data = loadData();
  if (!data.profiles.some((profile) => profile.id === profileId)) throw new Error("Profile không tồn tại.");
  const contents = findProfileContents(profileId);
  if (!contents) throw new Error("Hãy mở profile này trước khi đăng nhập.");

  const saved = readSavedLogin(profileId, data);
  const account = String(input.account || saved.account || "").trim().slice(0, 320);
  const password = String(input.password || saved.password || "").slice(0, 512);
  const twoFactorCode = String(input.twoFactorCode || "").replace(/\s+/g, "").slice(0, 16);
  if (!account) throw new Error("Hãy nhập tài khoản Facebook.");
  if (!password) throw new Error("Hãy nhập mật khẩu Facebook.");

  const currentUrl = String(contents.getURL() || "");
  const alreadyOnLoginFlow = /facebook\.com\/(?:login|checkpoint|two_step|two-factor)/i.test(currentUrl);
  if (!alreadyOnLoginFlow) await contents.loadURL("https://www.facebook.com/login/");

  let result = await contents.executeJavaScript(loginScript(account, password, twoFactorCode), true);
  if (result?.stage === "credentials_submitted") {
    await wait(2500);
    if (contents.isDestroyed()) throw new Error("Cửa sổ profile đã đóng.");
    result = await contents.executeJavaScript(loginScript(account, password, twoFactorCode), true);
  }

  return {
    ok: true,
    stage: result?.stage || "manual_required",
    requiresTwoFactor: result?.stage === "two_factor_required",
    url: String(contents.getURL() || "")
  };
}

app.whenReady().then(() => {
  ipcMain.removeHandler("profile-login:run");
  ipcMain.handle("profile-login:run", (_event, profileId, input) => runLogin(profileId, input || {}));
});
