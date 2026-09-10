const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pagebot", {
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    create: (input) => ipcRenderer.invoke("profiles:create", input),
    update: (profileId, patch) => ipcRenderer.invoke("profiles:update", profileId, patch),
    delete: (profileId) => ipcRenderer.invoke("profiles:delete", profileId),
    open: (profileId) => ipcRenderer.invoke("profile:open", profileId)
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
    suggest: () => ipcRenderer.invoke("ai:suggest")
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
