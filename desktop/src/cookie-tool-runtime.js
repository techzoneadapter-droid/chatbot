const { app, BrowserWindow, ipcMain, session, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const EXTENSION_NAME = "Get Cookie For FPlus";
const loads = new Map();
const loadedByProfile = new Map();
const windowsByProfile = new Map();

function extensionPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "extensions", "getcookiefplus");
  }
  return path.join(__dirname, "..", "extensions", "getcookiefplus");
}

function profileIsOpen(profileId) {
  const target = session.fromPartition(`persist:pagebot-${profileId}`);
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
    const ses = session.fromPartition(`persist:pagebot-${profileId}`);
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

  // Important: the extension is loaded only here, after the user explicitly
  // presses the Cookie button. Opening a Facebook profile never loads it.
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
      session: session.fromPartition(`persist:pagebot-${profileId}`),
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
  ipcMain.removeHandler("cookie-tool:open");
  ipcMain.handle("cookie-tool:open", (_event, profileId) => openTool(String(profileId || "")));
}

app.whenReady().then(() => {
  // main.js registers its handlers during the same ready turn. Defer one tick
  // so this demand-driven handler wins without doing any extension work now.
  setTimeout(register, 0);
});
