const { contextBridge, ipcRenderer } = require("electron");

let initialProfiles = null;
let startupOpenDeferred = false;

async function listProfiles() {
  const profiles = await ipcRenderer.invoke("profiles:list");
  if (initialProfiles === null) initialProfiles = Array.isArray(profiles) ? profiles : [];
  return profiles;
}

async function openProfile(profileId) {
  // renderer.js opens the first saved profile automatically during startup. Return
  // its metadata once without creating Chromium/session work. Any later user click
  // uses the real lazy network + browser open path.
  if (!startupOpenDeferred && Array.isArray(initialProfiles)) {
    const existing = initialProfiles.find((profile) => profile.id === profileId);
    if (existing) {
      startupOpenDeferred = true;
      return existing;
    }
  }
  startupOpenDeferred = true;
  await ipcRenderer.invoke("profile:prepare-network", profileId);
  return ipcRenderer.invoke("profile:open", profileId);
}

contextBridge.exposeInMainWorld("pagebot", {
  profiles: {
    list: listProfiles,
    create: (input) => ipcRenderer.invoke("profiles:create", input),
    update: (profileId, patch) => ipcRenderer.invoke("profiles:update", profileId, patch),
    delete: (profileId) => ipcRenderer.invoke("profiles:delete", profileId),
    open: openProfile
  },
  browser: {
    back: () => ipcRenderer.invoke("browser:back"),
    forward: () => ipcRenderer.invoke("browser:forward"),
    reload: () => ipcRenderer.invoke("browser:reload"),
    home: () => ipcRenderer.invoke("browser:home"),
    navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
    state: () => ipcRenderer.invoke("browser:state")
  },
  chat: {
    snapshot: () => ipcRenderer.invoke("chat:snapshot"),
    send: (text) => ipcRenderer.invoke("chat:send", text)
  },
  ai: {
    suggest: () => ipcRenderer.invoke("ai:suggest"),
    test: () => ipcRenderer.invoke("ai:test"),
    models: (provider) => ipcRenderer.invoke("ai:models", provider),
    probe: (input) => ipcRenderer.invoke("ai:probe", input)
  },
  proxy: {
    get: (profileId) => ipcRenderer.invoke("proxy:get", profileId),
    save: (profileId, config) => ipcRenderer.invoke("proxy:save", profileId, config),
    test: (profileId) => ipcRenderer.invoke("proxy:test", profileId),
    disable: (profileId) => ipcRenderer.invoke("proxy:disable", profileId)
  },
  secrets: {
    status: () => ipcRenderer.invoke("secrets:status"),
    set: (provider, apiKey) => ipcRenderer.invoke("secrets:set", provider, apiKey),
    clear: (provider) => ipcRenderer.invoke("secrets:clear", provider)
  },
  onEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pagebot:event", handler);
    return () => ipcRenderer.removeListener("pagebot:event", handler);
  }
});
