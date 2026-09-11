const { app, ipcMain, session, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Favor GPU-backed painting for the embedded browser and remove smooth-scroll work
// that is noticeable on Facebook's very large DOM. These switches are set before ready.
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-smooth-scrolling");

const proxyAuthBySession = new WeakMap();
const appliedProxySignatures = new Map();
const performanceConfiguredSessions = new WeakSet();

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
}

function installDataFileReadCache() {
  const target = path.resolve(dataFile());
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const originalWriteFileSync = fs.writeFileSync.bind(fs);
  const originalRenameSync = fs.renameSync.bind(fs);
  const originalCopyFileSync = fs.copyFileSync.bind(fs);
  const originalUnlinkSync = fs.unlinkSync.bind(fs);
  let cachedUtf8 = null;

  const sameTarget = (value) => {
    try {
      return path.resolve(String(value)) === target;
    } catch {
      return false;
    }
  };
  const touchesTarget = (value) => {
    try {
      const resolved = path.resolve(String(value));
      return resolved === target || resolved === `${target}.tmp`;
    } catch {
      return false;
    }
  };
  const utf8Requested = (options) => options === "utf8" || options === "utf-8" || options?.encoding === "utf8" || options?.encoding === "utf-8";

  fs.readFileSync = function patchedReadFileSync(file, options) {
    if (sameTarget(file) && utf8Requested(options)) {
      if (cachedUtf8 !== null) return cachedUtf8;
      const value = originalReadFileSync(file, options);
      cachedUtf8 = String(value);
      return value;
    }
    return originalReadFileSync(file, options);
  };

  fs.writeFileSync = function patchedWriteFileSync(file, ...args) {
    if (touchesTarget(file)) cachedUtf8 = null;
    return originalWriteFileSync(file, ...args);
  };

  fs.renameSync = function patchedRenameSync(source, destination) {
    const result = originalRenameSync(source, destination);
    if (touchesTarget(source) || sameTarget(destination)) cachedUtf8 = null;
    return result;
  };

  fs.copyFileSync = function patchedCopyFileSync(source, destination, ...args) {
    const result = originalCopyFileSync(source, destination, ...args);
    if (sameTarget(destination)) cachedUtf8 = null;
    return result;
  };

  fs.unlinkSync = function patchedUnlinkSync(file) {
    const result = originalUnlinkSync(file);
    if (touchesTarget(file)) cachedUtf8 = null;
    return result;
  };
}

function loadData() {
  const fallback = { profiles: [], secrets: {} };
  try {
    const file = dataFile();
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
    };
  } catch {
    return fallback;
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  const target = dataFile();
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  try {
    fs.renameSync(temp, target);
  } catch {
    fs.copyFileSync(temp, target);
    fs.unlinkSync(temp);
  }
}

function encryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage chưa sẵn sàng.");
  return safeStorage.encryptString(String(value || "")).toString("base64");
}

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}

function proxySecretKey(profileId) {
  return `proxy:${profileId}`;
}

function normalizeProxy(input = {}) {
  const type = input.type === "socks5" ? "socks5" : "http";
  const host = String(input.host || "").trim().slice(0, 255);
  const rawPort = Number.parseInt(String(input.port || ""), 10);
  const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 0;
  const username = String(input.username || "").trim().slice(0, 255);
  return {
    enabled: Boolean(input.enabled),
    type,
    host,
    port,
    username
  };
}

function proxySignature(proxy) {
  const value = normalizeProxy(proxy);
  return [value.enabled ? "1" : "0", value.type, value.host, value.port, value.username].join("|");
}

function publicProxy(profile, data = loadData()) {
  const proxy = normalizeProxy(profile?.proxy || {});
  return {
    ...proxy,
    hasPassword: Boolean(data.secrets?.[proxySecretKey(profile?.id)])
  };
}

function getProfile(profileId, data = loadData()) {
  return data.profiles.find((profile) => profile.id === profileId) || null;
}

function validateEnabledProxy(proxy) {
  if (!proxy.enabled) return;
  if (!proxy.host) throw new Error("Hãy nhập host/IP proxy.");
  if (!proxy.port) throw new Error("Port proxy không hợp lệ.");
}

function proxyRules(proxy) {
  if (proxy.type === "socks5") return `socks5://${proxy.host}:${proxy.port}`;
  return `http://${proxy.host}:${proxy.port}`;
}

function installPerformanceFilters(ses) {
  if (!ses || performanceConfiguredSessions.has(ses)) return;
  performanceConfiguredSessions.add(ses);

  // Messenger/Business Suite can preload videos in the background even when the
  // user only needs text chat. Blocking media requests saves a large amount of
  // proxy bandwidth while leaving HTML, JS, CSS, images and chat attachments intact.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = String(details.url || "");
    const heavyMedia = details.resourceType === "media" || /\.(?:mp4|m4v|webm|mov)(?:\?|$)/i.test(url);
    callback({ cancel: heavyMedia });
  });
}

function cacheProxyAuth(profile, data, ses) {
  const proxy = normalizeProxy(profile?.proxy || {});
  if (!proxy.enabled || !proxy.username) {
    proxyAuthBySession.delete(ses);
    return;
  }
  proxyAuthBySession.set(ses, {
    profileId: profile.id,
    username: proxy.username,
    password: decryptSecret(data.secrets?.[proxySecretKey(profile.id)]) || ""
  });
}

function invalidateProxyAuth(profileId) {
  try {
    proxyAuthBySession.delete(session.fromPartition(`persist:pagebot-${profileId}`));
  } catch {}
}

async function applyProxy(profileId, proxyOverride) {
  const data = loadData();
  const profile = getProfile(profileId, data);
  if (!profile) throw new Error("Profile không tồn tại.");
  const proxy = normalizeProxy(proxyOverride || profile.proxy || {});
  validateEnabledProxy(proxy);
  const ses = session.fromPartition(`persist:pagebot-${profileId}`);
  installPerformanceFilters(ses);
  cacheProxyAuth({ ...profile, proxy }, data, ses);

  const signature = proxySignature(proxy);
  if (appliedProxySignatures.get(profileId) === signature) return proxy;

  if (!proxy.enabled) {
    await ses.setProxy({ mode: "direct" });
  } else {
    await ses.setProxy({
      mode: "fixed_servers",
      proxyRules: proxyRules(proxy),
      proxyBypassRules: "<-loopback>"
    });
  }
  appliedProxySignatures.set(profileId, signature);

  try {
    await ses.closeAllConnections();
  } catch {}
  return proxy;
}

async function saveProxy(profileId, input = {}) {
  const data = loadData();
  const profile = getProfile(profileId, data);
  if (!profile) throw new Error("Profile không tồn tại.");
  const proxy = normalizeProxy(input);
  validateEnabledProxy(proxy);
  profile.proxy = proxy;

  if (typeof input.password === "string" && input.password.length) {
    data.secrets[proxySecretKey(profileId)] = encryptSecret(input.password.slice(0, 512));
  }
  if (input.clearPassword === true) {
    delete data.secrets[proxySecretKey(profileId)];
  }

  saveData(data);
  invalidateProxyAuth(profileId);
  await applyProxy(profileId, proxy);
  return publicProxy(profile, data);
}

async function testProxy(profileId) {
  const data = loadData();
  const profile = getProfile(profileId, data);
  if (!profile) throw new Error("Profile không tồn tại.");
  const proxy = await applyProxy(profileId, profile.proxy || {});
  if (!proxy.enabled) return { ok: true, direct: true, ip: "", resolvedProxy: "DIRECT" };

  const ses = session.fromPartition(`persist:pagebot-${profileId}`);
  const resolvedProxy = await ses.resolveProxy("https://www.facebook.com/");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await ses.fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
    const payload = await response.json();
    return {
      ok: true,
      direct: false,
      ip: String(payload?.ip || ""),
      resolvedProxy: String(resolvedProxy || "")
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resolveProxyAuth(webContents) {
  const ses = webContents?.session;
  if (!ses) return null;
  const cached = proxyAuthBySession.get(ses);
  if (cached) return cached;

  const data = loadData();
  for (const profile of data.profiles) {
    try {
      if (session.fromPartition(`persist:pagebot-${profile.id}`) !== ses) continue;
      cacheProxyAuth(profile, data, ses);
      return proxyAuthBySession.get(ses) || null;
    } catch {}
  }
  return null;
}

app.on("login", (event, webContents, _details, authInfo, callback) => {
  if (!authInfo?.isProxy || !webContents) return;
  const auth = resolveProxyAuth(webContents);
  if (!auth?.username) return;
  event.preventDefault();
  callback(auth.username, auth.password || "");
});

function registerProxyIpc() {
  ipcMain.handle("proxy:get", (_event, profileId) => {
    const data = loadData();
    const profile = getProfile(profileId, data);
    if (!profile) throw new Error("Profile không tồn tại.");
    return publicProxy(profile, data);
  });

  ipcMain.handle("proxy:save", async (_event, profileId, input) => saveProxy(profileId, input || {}));
  ipcMain.handle("proxy:test", async (_event, profileId) => testProxy(profileId));
  ipcMain.handle("proxy:disable", async (_event, profileId) => {
    const data = loadData();
    const profile = getProfile(profileId, data);
    if (!profile) throw new Error("Profile không tồn tại.");
    const next = normalizeProxy({ ...(profile.proxy || {}), enabled: false });
    profile.proxy = next;
    saveData(data);
    invalidateProxyAuth(profileId);
    await applyProxy(profileId, next);
    return publicProxy(profile, data);
  });
}

app.whenReady().then(async () => {
  installDataFileReadCache();
  registerProxyIpc();
  const data = loadData();
  await Promise.allSettled(data.profiles.map(async (profile) => {
    const ses = session.fromPartition(`persist:pagebot-${profile.id}`);
    installPerformanceFilters(ses);
    if (!profile?.proxy?.enabled) return;
    try {
      await applyProxy(profile.id, profile.proxy);
    } catch (error) {
      console.error("[proxy] startup apply failed", profile.id, error instanceof Error ? error.message : error);
    }
  }));
  require("./main");
});
