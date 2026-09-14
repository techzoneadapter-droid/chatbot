const { contextBridge, ipcRenderer } = require("electron");

let liteSnapshotReadyPromise = null;
let salesRuntimeReadyPromise = null;

async function openProfile(profileId) {
  await ipcRenderer.invoke("profile:prepare-performance", profileId);
  await ipcRenderer.invoke("profile:prepare-network", profileId);
  return ipcRenderer.invoke("profile:open", profileId);
}

async function ensureLiteSnapshotReader() {
  if (!liteSnapshotReadyPromise) {
    liteSnapshotReadyPromise = ipcRenderer.invoke("chat:enable-lite-snapshot").catch((error) => {
      liteSnapshotReadyPromise = null;
      throw error;
    });
  }
  return liteSnapshotReadyPromise;
}

async function ensureSalesRuntime() {
  if (!salesRuntimeReadyPromise) {
    salesRuntimeReadyPromise = ipcRenderer.invoke("sales:ensure-runtime").catch((error) => {
      salesRuntimeReadyPromise = null;
      throw error;
    });
  }
  return salesRuntimeReadyPromise;
}

async function readChatSnapshot() {
  await ensureLiteSnapshotReader();
  return ipcRenderer.invoke("chat:snapshot");
}

async function listConversations() {
  await ensureLiteSnapshotReader();
  return ipcRenderer.invoke("chat:list-conversations");
}

async function openConversation(locator) {
  await ensureLiteSnapshotReader();
  return ipcRenderer.invoke("chat:open-conversation", locator);
}

async function analyzeFollowup(profileId, snapshot, mode) {
  await ensureSalesRuntime();
  return ipcRenderer.invoke("sales:analyze-followup", profileId, snapshot, mode);
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
    state: () => ipcRenderer.invoke("browser:state"),
    mobileState: () => ipcRenderer.invoke("browser:mobile-emulation:state"),
    setMobile: (enabled) => ipcRenderer.invoke("browser:mobile-emulation:set", Boolean(enabled))
  },
  chat: {
    snapshot: readChatSnapshot,
    listConversations,
    openConversation,
    send: (text) => ipcRenderer.invoke("chat:send", text)
  },
  sales: {
    analyzeFollowup
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
  profileLogin: {
    get: (profileId) => ipcRenderer.invoke("profile-login:get", profileId),
    save: (profileId, input) => ipcRenderer.invoke("profile-login:save", profileId, input),
    clear: (profileId) => ipcRenderer.invoke("profile-login:clear", profileId),
    run: (profileId, input) => ipcRenderer.invoke("profile-login:run", profileId, input)
  },
  legacyAuto: {
    setEnabled: (enabled) => ipcRenderer.invoke("legacy-auto:set-enabled", Boolean(enabled)),
    status: () => ipcRenderer.invoke("legacy-auto:status")
  },
  layout: {
    setAiPanelCollapsed: (collapsed) => ipcRenderer.invoke("layout:set-ai-panel-collapsed", Boolean(collapsed))
  },
  secrets: {
    status: () => ipcRenderer.invoke("secrets:status"),
    set: (provider, apiKey) => ipcRenderer.invoke("secrets:set", provider, apiKey),
    clear: (provider) => ipcRenderer.invoke("secrets:clear", provider)
  },
  updates: {
    status: () => ipcRenderer.invoke("updates:status"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install")
  },
  onEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pagebot:event", handler);
    return () => ipcRenderer.removeListener("pagebot:event", handler);
  }
});
