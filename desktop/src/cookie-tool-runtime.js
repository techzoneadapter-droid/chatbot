const { app, BrowserWindow, ipcMain, session, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const EXTENSION_NAME = "Get Cookie For FPlus";
const loads = new Map();
const loadedByProfile = new Map();
const windowsByProfile = new Map();

const FACEBOOK_HOSTS = [
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://m.facebook.com",
  "https://mbasic.facebook.com",
  "https://business.facebook.com",
  "https://mobile.facebook.com",
  "https://developers.facebook.com",
  "https://upload.facebook.com"
];

function extensionPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "extensions", "getcookiefplus");
  }
  return path.join(__dirname, "..", "extensions", "getcookiefplus");
}

function partitionName(profileId) {
  return `persist:pagebot-${String(profileId || "")}`;
}

function getSession(profileId) {
  return session.fromPartition(partitionName(profileId));
}

function profileIsOpen(profileId) {
  const target = getSession(profileId);
  return webContents.getAllWebContents().some((contents) => {
    try {
      return !contents.isDestroyed()
        && contents.session === target
        && /^https?:\/\//i.test(String(contents.getURL() || ""));
    } catch {
      return false;
    }
  });
}

function findProfileContents(profileId) {
  const target = getSession(profileId);
  return webContents.getAllWebContents().find((contents) => {
    try {
      return !contents.isDestroyed() && contents.session === target;
    } catch {
      return false;
    }
  }) || null;
}

function parseCookieString(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr
          .map((item) => ({
            name: String(item?.name || "").trim(),
            value: String(item?.value ?? "").trim()
          }))
          .filter((c) => c.name && c.value !== undefined);
      }
    } catch {
      // fall through
    }
  }

  const pairs = [];
  for (const part of text.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!name || name.toLowerCase() === "useragent") continue;
    pairs.push({ name, value });
  }
  return pairs;
}

function cookieToExportLine(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function clearFacebookCookies(profileId) {
  const ses = getSession(profileId);
  const all = await ses.cookies.get({ domain: ".facebook.com" });
  const alsoWww = await ses.cookies.get({ domain: "www.facebook.com" });
  const alsoBusiness = await ses.cookies.get({ domain: ".business.facebook.com" });
  const seen = new Set();
  const list = [];
  for (const c of [...all, ...alsoWww, ...alsoBusiness]) {
    const key = `${c.domain}|${c.path}|${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(c);
  }
  for (const c of list) {
    const url = `http${c.secure ? "s" : ""}://${(c.domain || "").replace(/^\./, "")}${c.path || "/"}`;
    try {
      await ses.cookies.remove(url, c.name);
    } catch {}
  }
  for (const host of FACEBOOK_HOSTS) {
    try {
      const hostCookies = await ses.cookies.get({ url: host });
      for (const c of hostCookies) {
        await ses.cookies.remove(host, c.name).catch(() => {});
      }
    } catch {}
  }
  return list.length;
}

async function importCookies(profileId, cookieString, options = {}) {
  const id = String(profileId || "");
  if (!id) throw new Error("Thiếu profileId.");
  if (!profileIsOpen(id) && !options.allowClosed) {
    throw new Error("Hãy mở profile trước khi import cookie.");
  }

  const pairs = parseCookieString(cookieString);
  if (!pairs.length) throw new Error("Cookie rỗng hoặc không đúng định dạng (cần dạng name=value; ...).");

  const hasCUser = pairs.some((p) => p.name === "c_user");
  const hasXs = pairs.some((p) => p.name === "xs");

  if (options.clearFirst !== false) {
    await clearFacebookCookies(id);
  }

  const ses = getSession(id);
  const expirationDate = Math.floor(Date.now() / 1000) + 31536000;
  let setCount = 0;
  const errors = [];

  for (const { name, value } of pairs) {
    const base = {
      name,
      value,
      path: "/",
      secure: true,
      httpOnly: name === "xs" || name === "c_user" || name === "fr" || name === "datr",
      expirationDate
    };

    for (const url of FACEBOOK_HOSTS) {
      try {
        await ses.cookies.set({
          url,
          ...base,
          domain: url.includes("business.facebook.com") ? ".business.facebook.com" : ".facebook.com"
        });
        setCount += 1;
      } catch (err) {
        try {
          await ses.cookies.set({ url, name, value, path: "/", secure: true, expirationDate });
          setCount += 1;
        } catch (err2) {
          errors.push(`${name}@${url}: ${err2?.message || err2}`);
        }
      }
    }
  }

  try {
    await ses.cookies.flushStore();
  } catch {}

  const contents = findProfileContents(id);
  if (contents && !contents.isDestroyed()) {
    try {
      const current = String(contents.getURL() || "");
      if (/facebook\.com/i.test(current)) {
        await contents.reload();
      } else {
        await contents.loadURL("https://www.facebook.com/");
      }
    } catch {}
  }

  return {
    ok: true,
    importedNames: pairs.map((p) => p.name),
    pairCount: pairs.length,
    setOperations: setCount,
    hasCUser,
    hasXs,
    warnings: !hasCUser || !hasXs
      ? ["Cookie thiếu c_user hoặc xs – có thể chưa đăng nhập đủ."]
      : [],
    errors: errors.slice(0, 8)
  };
}

async function exportCookies(profileId) {
  const id = String(profileId || "");
  if (!id) throw new Error("Thiếu profileId.");
  const ses = getSession(id);
  const cookies = await ses.cookies.get({ domain: ".facebook.com" });
  const extra = await ses.cookies.get({ domain: "www.facebook.com" });
  const business = await ses.cookies.get({ domain: ".business.facebook.com" });
  const map = new Map();
  for (const c of [...cookies, ...extra, ...business]) {
    if (!map.has(c.name)) map.set(c.name, c);
  }
  const list = Array.from(map.values());
  const line = cookieToExportLine(list);
  const cUser = list.find((c) => c.name === "c_user")?.value || "";
  return {
    ok: true,
    cookie: line,
    count: list.length,
    c_user: cUser,
    hasSession: Boolean(cUser && list.some((c) => c.name === "xs"))
  };
}

async function ensureLoaded(profileId) {
  const ready = loadedByProfile.get(profileId);
  if (ready) return ready;
  const pending = loads.get(profileId);
  if (pending) return pending;

  const promise = (async () => {
    const dir = extensionPath();
    if (!fs.existsSync(path.join(dir, "manifest.json"))) {
      throw new Error("Không tìm thấy tool Cookie trong bản desktop.");
    }
    const ses = getSession(profileId);
    const existing = ses.extensions.getAllExtensions().find((item) => item.name === EXTENSION_NAME);
    const extension = existing || await ses.extensions.loadExtension(dir);
    loadedByProfile.set(profileId, extension);
    return extension;
  })();

  loads.set(profileId, promise);
  try {
    return await promise;
  } finally {
    loads.delete(profileId);
  }
}

async function openTool(profileId) {
  if (!profileId || !profileIsOpen(profileId)) {
    throw new Error("Hãy mở profile trước khi mở tool Cookie.");
  }

  const extension = await ensureLoaded(profileId);
  const existing = windowsByProfile.get(profileId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { ok: true, extensionId: extension.id, alreadyOpen: true };
  }

  const popup = new BrowserWindow({
    width: 320,
    height: 700,
    minWidth: 280,
    minHeight: 420,
    show: false,
    title: EXTENSION_NAME,
    backgroundColor: "#ffffff",
    webPreferences: {
      session: getSession(profileId),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  popup.setMenuBarVisibility(false);
  windowsByProfile.set(profileId, popup);
  popup.on("closed", () => {
    if (windowsByProfile.get(profileId) === popup) windowsByProfile.delete(profileId);
  });
  await popup.loadURL(`${extension.url}/popup.html`);
  popup.show();
  popup.focus();
  return { ok: true, extensionId: extension.id, alreadyOpen: false };
}

function register() {
  try { ipcMain.removeHandler("cookie-tool:open"); } catch {}
  try { ipcMain.removeHandler("cookie:import"); } catch {}
  try { ipcMain.removeHandler("cookie:export"); } catch {}
  try { ipcMain.removeHandler("cookie:clear"); } catch {}

  ipcMain.handle("cookie-tool:open", (_event, profileId) => openTool(String(profileId || "")));

  ipcMain.handle("cookie:import", async (_event, profileId, cookieString, options) => {
    return importCookies(String(profileId || ""), String(cookieString || ""), options || {});
  });

  ipcMain.handle("cookie:export", async (_event, profileId) => {
    return exportCookies(String(profileId || ""));
  });

  ipcMain.handle("cookie:clear", async (_event, profileId) => {
    const id = String(profileId || "");
    if (!id) throw new Error("Thiếu profileId.");
    const removed = await clearFacebookCookies(id);
    const contents = findProfileContents(id);
    if (contents && !contents.isDestroyed()) {
      try {
        await contents.loadURL("https://www.facebook.com/login/");
      } catch {}
    }
    return { ok: true, removed };
  });
}

if (app.isReady()) {
  register();
  setTimeout(register, 0);
} else {
  app.whenReady().then(() => {
    register();
    setTimeout(register, 0);
  });
}
