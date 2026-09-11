const { app, ipcMain, session, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
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

async function applyProxy(profileId, proxyOverride) {
  const data = loadData();
  const profile = getProfile(profileId, data);
  if (!profile) throw new Error("Profile không tồn tại.");
  const proxy = normalizeProxy(proxyOverride || profile.proxy || {});
  validateEnabledProxy(proxy);
  const ses = session.fromPartition(`persist:pagebot-${profileId}`);
  if (!proxy.enabled) {
    await ses.setProxy({ mode: "direct" });
  } else {
    await ses.setProxy({
      mode: "fixed_servers",
      proxyRules: proxyRules(proxy),
      proxyBypassRules: "<-loopback>"
    });
  }
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

function findProfileForWebContents(webContents) {
  const data = loadData();
  return data.profiles.find((profile) => {
    try {
      return session.fromPartition(`persist:pagebot-${profile.id}`) === webContents.session;
    } catch {
      return false;
    }
  }) || null;
}

app.on("login", (event, webContents, _details, authInfo, callback) => {
  if (!authInfo?.isProxy || !webContents) return;
  const data = loadData();
  const profile = findProfileForWebContents(webContents);
  if (!profile) return;
  const proxy = normalizeProxy(profile.proxy || {});
  if (!proxy.enabled || !proxy.username) return;
  const password = decryptSecret(data.secrets?.[proxySecretKey(profile.id)]);
  event.preventDefault();
  callback(proxy.username, password || "");
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
    await applyProxy(profileId, next);
    return publicProxy(profile, data);
  });
}

app.whenReady().then(async () => {
  registerProxyIpc();
  const data = loadData();
  for (const profile of data.profiles) {
    if (!profile?.proxy?.enabled) continue;
    try {
      await applyProxy(profile.id, profile.proxy);
    } catch (error) {
      console.error("[proxy] startup apply failed", profile.id, error instanceof Error ? error.message : error);
    }
  }
  require("./main");
});
