const { contextBridge, ipcRenderer } = require("electron");

async function openProfile(profileId) {
  // Profiles are never opened automatically at startup. When the renderer calls
  // this function it is a real user action, so initialize only this profile's
  // network/session and then create its browser view.
  await ipcRenderer.invoke("profile:prepare-network", profileId);
  return ipcRenderer.invoke("profile:open", profileId);
}

contextBridge.exposeInMainWorld("pagebot", {
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
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
