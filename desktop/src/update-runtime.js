const { app, BrowserWindow, ipcMain } = require("electron");

let updater = null;
let listenersBound = false;
let state = {
  phase: "idle",
  currentVersion: app.getVersion(),
  availableVersion: "",
  progress: 0,
  message: ""
};

function publicState(extra = {}) {
  return {
    packaged: app.isPackaged,
    ...state,
    ...extra
  };
}

function emit(extra = {}) {
  state = { ...state, ...extra };
  const payload = publicState();
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send("pagebot:event", { type: "update-state", payload, at: Date.now() });
    } catch {}
  }
  return payload;
}

function ensureUpdater() {
  if (!app.isPackaged) return null;
  if (!updater) {
    ({ autoUpdater: updater } = require("electron-updater"));
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.logger = null;
  }
  if (!listenersBound) {
    listenersBound = true;
    updater.on("checking-for-update", () => emit({ phase: "checking", message: "Đang kiểm tra bản mới...", progress: 0 }));
    updater.on("update-available", (info) => emit({ phase: "available", availableVersion: String(info?.version || ""), message: `Có bản mới ${info?.version || ""}`.trim() }));
    updater.on("update-not-available", () => emit({ phase: "latest", availableVersion: "", message: "Đang dùng bản mới nhất.", progress: 0 }));
    updater.on("download-progress", (progress) => emit({ phase: "downloading", progress: Math.max(0, Math.min(100, Number(progress?.percent || 0))), message: `Đang tải ${Math.round(Number(progress?.percent || 0))}%` }));
    updater.on("update-downloaded", (info) => emit({ phase: "ready", availableVersion: String(info?.version || state.availableVersion || ""), progress: 100, message: "Đã tải xong. Sẵn sàng cài đặt." }));
    updater.on("error", (error) => emit({ phase: "error", message: String(error?.message || error || "Lỗi cập nhật").slice(0, 500) }));
  }
  return updater;
}

ipcMain.handle("updates:status", () => publicState());

ipcMain.handle("updates:check", async () => {
  if (!app.isPackaged) return emit({ phase: "dev", message: "Bản DEV không kiểm tra cập nhật. Hãy dùng bản cài đặt để cập nhật tự động." });
  const autoUpdater = ensureUpdater();
  emit({ phase: "checking", message: "Đang kiểm tra bản mới...", progress: 0 });
  const result = await autoUpdater.checkForUpdates();
  const version = String(result?.updateInfo?.version || "");
  if (version && version !== app.getVersion()) return emit({ phase: "available", availableVersion: version, message: `Có bản mới ${version}` });
  return emit({ phase: "latest", availableVersion: "", message: "Đang dùng bản mới nhất.", progress: 0 });
});

ipcMain.handle("updates:download", async () => {
  if (!app.isPackaged) throw new Error("Bản DEV không thể tự cập nhật.");
  const autoUpdater = ensureUpdater();
  emit({ phase: "downloading", progress: 0, message: "Bắt đầu tải bản cập nhật..." });
  await autoUpdater.downloadUpdate();
  return publicState();
});

ipcMain.handle("updates:install", () => {
  if (!app.isPackaged) throw new Error("Bản DEV không thể tự cập nhật.");
  const autoUpdater = ensureUpdater();
  if (state.phase !== "ready") throw new Error("Chưa có bản cập nhật đã tải xong.");
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});
