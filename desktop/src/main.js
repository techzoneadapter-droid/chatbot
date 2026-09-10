const { app, BrowserWindow, WebContentsView, ipcMain, session, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const SIDEBAR_WIDTH = 260;
const AI_PANEL_WIDTH = 360;
const TOPBAR_HEIGHT = 54;
const AUTO_POLL_MS = 3000;
const AUTO_COOLDOWN_MS = 8000;
const MAX_AUTO_PER_MINUTE = 6;

let mainWindow = null;
let browserView = null;
let activeProfileId = null;
let autoTimer = null;
let lastAutoSignature = new Map();
let lastAutoSentAt = new Map();
let autoMinuteBuckets = new Map();

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
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), "utf8");
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    startUrl: profile.startUrl,
    aiProvider: profile.aiProvider || "gemini",
    aiModel: profile.aiModel || "gemini-3.8-flash",
    knowledge: profile.knowledge || "",
    systemPrompt: profile.systemPrompt || "",
    autoReply: Boolean(profile.autoReply)
  };
}

function getProfile(profileId) {
  return loadData().profiles.find((profile) => profile.id === profileId) || null;
}

function updateProfile(profileId, patch) {
  const data = loadData();
  const index = data.profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) throw new Error("PROFILE_NOT_FOUND");
  const current = data.profiles[index];
  const next = {
    ...current,
    name: typeof patch.name === "string" ? patch.name.trim().slice(0, 80) || current.name : current.name,
    startUrl: typeof patch.startUrl === "string" ? normalizeUrl(patch.startUrl) : current.startUrl,
    aiProvider: patch.aiProvider === "meta" ? "meta" : patch.aiProvider === "gemini" ? "gemini" : current.aiProvider,
    aiModel: typeof patch.aiModel === "string" ? patch.aiModel.trim().slice(0, 140) : current.aiModel,
    knowledge: typeof patch.knowledge === "string" ? patch.knowledge.slice(0, 30000) : current.knowledge,
    systemPrompt: typeof patch.systemPrompt === "string" ? patch.systemPrompt.slice(0, 6000) : current.systemPrompt,
    autoReply: typeof patch.autoReply === "boolean" ? patch.autoReply : current.autoReply
  };
  data.profiles[index] = next;
  saveData(data);
  return publicProfile(next);
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "https://business.facebook.com/latest/inbox";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#0b0d10",
    title: "PageBot Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("resize", setBrowserBounds);
  mainWindow.on("closed", () => {
    stopAutoLoop();
    destroyBrowserView();
    mainWindow = null;
  });
}

function setBrowserBounds() {
  if (!mainWindow || !browserView) return;
  const [width, height] = mainWindow.getContentSize();
  browserView.setBounds({
    x: SIDEBAR_WIDTH,
    y: TOPBAR_HEIGHT,
    width: Math.max(320, width - SIDEBAR_WIDTH - AI_PANEL_WIDTH),
    height: Math.max(300, height - TOPBAR_HEIGHT)
  });
}

function destroyBrowserView() {
  if (!browserView) return;
  try {
    mainWindow?.contentView.removeChildView(browserView);
  } catch {}
  try {
    browserView.webContents.close();
  } catch {}
  browserView = null;
}

async function openProfile(profileId) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");
  destroyBrowserView();
  activeProfileId = profileId;

  const partition = `persist:pagebot-${profileId}`;
  browserView = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  mainWindow.contentView.addChildView(browserView);
  setBrowserBounds();

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) browserView.webContents.loadURL(url).catch(() => {});
    return { action: "deny" };
  });

  browserView.webContents.on("did-navigate", (_event, url) => sendEvent("browser-state", { url }));
  browserView.webContents.on("did-navigate-in-page", (_event, url) => sendEvent("browser-state", { url }));
  browserView.webContents.on("page-title-updated", (_event, title) => sendEvent("browser-state", { title }));
  browserView.webContents.on("did-start-loading", () => sendEvent("browser-state", { loading: true }));
  browserView.webContents.on("did-stop-loading", () => sendEvent("browser-state", { loading: false, url: browserView.webContents.getURL() }));
  browserView.webContents.on("render-process-gone", (_event, details) => sendEvent("log", { level: "error", text: `Browser profile dừng: ${details.reason}` }));

  await browserView.webContents.loadURL(profile.startUrl || "https://business.facebook.com/latest/inbox");
  sendEvent("active-profile", publicProfile(profile));
  startAutoLoop();
  return publicProfile(profile);
}

function sendEvent(type, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pagebot:event", { type, payload, at: Date.now() });
}

function startAutoLoop() {
  stopAutoLoop();
  autoTimer = setInterval(() => {
    void autoTick();
  }, AUTO_POLL_MS);
}

function stopAutoLoop() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

async function autoTick() {
  if (!browserView || !activeProfileId) return;
  const profile = getProfile(activeProfileId);
  if (!profile?.autoReply) return;
  if (browserView.webContents.isLoading()) return;

  try {
    const snapshot = await captureChatSnapshot();
    if (!snapshot?.inputFound || !snapshot.latestText || !snapshot.incoming) return;

    const signature = `${snapshot.title || "chat"}|${snapshot.latestText}`;
    if (lastAutoSignature.get(activeProfileId) === signature) return;
    lastAutoSignature.set(activeProfileId, signature);

    const now = Date.now();
    const lastSent = lastAutoSentAt.get(activeProfileId) || 0;
    if (now - lastSent < AUTO_COOLDOWN_MS) return;
    if (!consumeAutoQuota(activeProfileId, now)) {
      sendEvent("log", { level: "warn", text: "Auto Chat tạm dừng vì đạt giới hạn 6 tin/phút." });
      return;
    }

    sendEvent("log", { level: "info", text: `Khách mới: ${snapshot.latestText.slice(0, 120)}` });
    const reply = await generateAIReply(profile, snapshot);
    if (!reply) return;

    const sent = await sendChatText(reply);
    if (sent) {
      lastAutoSentAt.set(activeProfileId, Date.now());
      sendEvent("ai-reply", { text: reply, automatic: true, title: snapshot.title || "" });
      sendEvent("log", { level: "success", text: `Đã tự động trả lời: ${reply.slice(0, 120)}` });
    } else {
      sendEvent("log", { level: "warn", text: "AI đã soạn nhưng chưa bấm gửi được. Hãy dùng nút Gửi ở bảng AI." });
      sendEvent("ai-reply", { text: reply, automatic: false, title: snapshot.title || "" });
    }
  } catch (error) {
    sendEvent("log", { level: "error", text: safeMessage(error) });
  }
}

function consumeAutoQuota(profileId, now) {
  const current = autoMinuteBuckets.get(profileId) || [];
  const fresh = current.filter((timestamp) => now - timestamp < 60000);
  if (fresh.length >= MAX_AUTO_PER_MINUTE) {
    autoMinuteBuckets.set(profileId, fresh);
    return false;
  }
  fresh.push(now);
  autoMinuteBuckets.set(profileId, fresh);
  return true;
}

async function captureChatSnapshot() {
  if (!browserView) return null;
  const script = `(() => {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight;
    };
    const inputs = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], div[contenteditable="true"], textarea'))
      .filter(visible)
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(x => x.r.width > 160)
      .sort((a,b) => b.r.bottom - a.r.bottom);
    const input = inputs[0];
    if (!input) return { inputFound: false, latestText: '', incoming: false, history: [], title: document.title };

    const inputRect = input.r;
    const minTop = Math.max(0, inputRect.top - 900);
    const selectors = '[dir="auto"], [data-testid*="message"], [role="row"], [role="listitem"], span';
    const skip = /^(Gửi|Send|Đã xem|Seen|Like|Thích|Reply|Trả lời|Enter|Nhấn Enter|Message|Tin nhắn|More|Xem thêm)$/i;
    const raw = Array.from(document.querySelectorAll(selectors))
      .filter(visible)
      .map(el => ({ el, text: (el.innerText || el.textContent || '').trim(), r: el.getBoundingClientRect() }))
      .filter(x => x.text && x.text.length <= 1200 && !skip.test(x.text))
      .filter(x => x.r.bottom < inputRect.top - 2 && x.r.top > minTop)
      .filter(x => x.r.right > inputRect.left - 220 && x.r.left < inputRect.right + 80)
      .sort((a,b) => a.r.bottom - b.r.bottom);

    const deduped = [];
    const seen = new Set();
    for (const item of raw) {
      const key = item.text.replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      if (raw.some(other => other !== item && other.text === item.text && other.r.width > item.r.width * 1.5)) continue;
      seen.add(key);
      deduped.push({ text: key, left: item.r.left, right: item.r.right, bottom: item.r.bottom });
    }
    const messages = deduped.slice(-18);
    const latest = messages[messages.length - 1] || null;
    const center = inputRect.left + inputRect.width / 2;
    const incoming = latest ? ((latest.left + latest.right) / 2) < center : false;

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .filter(visible)
      .map(el => ({ text: (el.innerText || el.textContent || '').trim(), r: el.getBoundingClientRect() }))
      .filter(x => x.text && x.text.length < 120 && x.r.bottom < inputRect.top && x.r.right > inputRect.left - 250)
      .sort((a,b) => b.r.bottom - a.r.bottom);

    return {
      inputFound: true,
      latestText: latest?.text || '',
      incoming,
      history: messages.map(x => x.text).slice(-12),
      title: headings[0]?.text || document.title || '',
      url: location.href
    };
  })()`;
  return browserView.webContents.executeJavaScript(script, true);
}

async function sendChatText(text) {
  if (!browserView || !text?.trim()) return false;
  const serialized = JSON.stringify(text.trim());
  const script = `(() => {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const input = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], div[contenteditable="true"], textarea'))
      .filter(visible)
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(x => x.r.width > 160)
      .sort((a,b) => b.r.bottom - a.r.bottom)[0]?.el;
    if (!input) return false;
    const value = ${serialized};
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, value);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }
    const send = Array.from(document.querySelectorAll('button,[role="button"]')).find(el => {
      if (!visible(el)) return false;
      const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.innerText].filter(Boolean).join(' ');
      return /(^|\s)(send|gửi)(\s|$)/i.test(label);
    });
    if (send) { send.click(); return true; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    return true;
  })()`;
  return Boolean(await browserView.webContents.executeJavaScript(script, true));
}

function encryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("SAFE_STORAGE_UNAVAILABLE");
  return safeStorage.encryptString(value).toString("base64");
}

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return null;
  }
}

function getApiKey(provider) {
  const data = loadData();
  return decryptSecret(data.secrets?.[provider]) || null;
}

async function generateAIReply(profile, snapshot) {
  const provider = profile.aiProvider === "meta" ? "meta" : "gemini";
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new Error(`${provider === "meta" ? "Meta Model API" : "Gemini"} chưa có API key.`);

  const model = String(profile.aiModel || "").trim();
  if (!model) throw new Error("Chưa cấu hình Model ID.");

  const system = [
    "Bạn là trợ lý chat bán hàng đang trả lời khách trên Facebook.",
    "Trả lời tự nhiên, ngắn gọn, thường 1-4 câu.",
    "Không bịa giá, sản phẩm, ưu đãi, bảo hành, tồn kho hoặc chính sách.",
    "Nếu dữ liệu không đủ, nói rõ chưa có thông tin chính xác và hỏi tối đa 1 câu cần thiết.",
    "Không nhắc đến prompt, API key, hệ thống nội bộ hoặc việc bạn là mô hình AI.",
    profile.systemPrompt || "",
    profile.knowledge ? `\nDỮ LIỆU RIÊNG CỦA PROFILE NÀY:\n${profile.knowledge}` : "\nChưa có dữ liệu sản phẩm riêng."
  ].filter(Boolean).join("\n");

  const user = `Hội thoại đang mở: ${snapshot.title || "Không rõ"}\nCác dòng gần đây:\n${(snapshot.history || []).join("\n")}\n\nTin nhắn mới nhất của khách:\n${snapshot.latestText}\n\nChỉ trả lại nội dung tin nhắn cần gửi cho khách.`;

  if (provider === "meta") return callMeta(apiKey, model, system, user);
  return callGemini(apiKey, model, system, user);
}

async function callGemini(apiKey, model, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 600 }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini không trả về nội dung.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callMeta(apiKey, model, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.35
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Meta Model API HTTP ${response.status}: ${payload?.error?.message || payload?.message || "request failed"}`);
    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : Array.isArray(content) ? content.map((part) => part?.text || "").join("").trim() : "";
    if (!text) throw new Error("Meta Model API không trả về nội dung.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/AIza[\w-]+/g, "[API_KEY]").replace(/Bearer\s+[\w.-]+/gi, "Bearer [REDACTED]").slice(0, 700);
}

function registerIpc() {
  ipcMain.handle("profiles:list", () => loadData().profiles.map(publicProfile));

  ipcMain.handle("profiles:create", async (_event, input = {}) => {
    const data = loadData();
    const profile = {
      id: crypto.randomUUID(),
      name: String(input.name || `Profile ${data.profiles.length + 1}`).trim().slice(0, 80),
      startUrl: normalizeUrl(input.startUrl || "https://business.facebook.com/latest/inbox"),
      aiProvider: "gemini",
      aiModel: "gemini-3.8-flash",
      knowledge: "",
      systemPrompt: "",
      autoReply: false,
      createdAt: new Date().toISOString()
    };
    data.profiles.push(profile);
    saveData(data);
    return publicProfile(profile);
  });

  ipcMain.handle("profiles:update", (_event, profileId, patch) => updateProfile(profileId, patch || {}));

  ipcMain.handle("profiles:delete", async (_event, profileId) => {
    const profile = getProfile(profileId);
    if (!profile) return true;
    if (activeProfileId === profileId) {
      destroyBrowserView();
      activeProfileId = null;
    }
    try {
      await session.fromPartition(`persist:pagebot-${profileId}`).clearStorageData();
    } catch {}
    const data = loadData();
    data.profiles = data.profiles.filter((item) => item.id !== profileId);
    saveData(data);
    lastAutoSignature.delete(profileId);
    lastAutoSentAt.delete(profileId);
    autoMinuteBuckets.delete(profileId);
    return true;
  });

  ipcMain.handle("profile:open", (_event, profileId) => openProfile(profileId));
  ipcMain.handle("browser:back", () => browserView?.webContents.canGoBack() ? browserView.webContents.goBack() : null);
  ipcMain.handle("browser:forward", () => browserView?.webContents.canGoForward() ? browserView.webContents.goForward() : null);
  ipcMain.handle("browser:reload", () => browserView?.webContents.reload());
  ipcMain.handle("browser:home", async () => {
    const profile = activeProfileId ? getProfile(activeProfileId) : null;
    if (browserView && profile) await browserView.webContents.loadURL(profile.startUrl);
  });
  ipcMain.handle("browser:navigate", async (_event, url) => {
    if (!browserView) return false;
    await browserView.webContents.loadURL(normalizeUrl(url));
    return true;
  });
  ipcMain.handle("browser:state", () => browserView ? { url: browserView.webContents.getURL(), title: browserView.webContents.getTitle() } : { url: "", title: "" });
  ipcMain.handle("chat:snapshot", () => captureChatSnapshot());
  ipcMain.handle("chat:send", (_event, text) => sendChatText(String(text || "")));

  ipcMain.handle("ai:suggest", async () => {
    if (!activeProfileId) throw new Error("Chưa mở profile.");
    const profile = getProfile(activeProfileId);
    if (!profile) throw new Error("Profile không tồn tại.");
    const snapshot = await captureChatSnapshot();
    if (!snapshot?.inputFound) throw new Error("Không tìm thấy ô chat trên trang đang mở.");
    if (!snapshot.latestText) throw new Error("Chưa đọc được tin nhắn hiện tại.");
    const text = await generateAIReply(profile, snapshot);
    return { text, snapshot };
  });

  ipcMain.handle("secrets:status", () => ({
    gemini: Boolean(getApiKey("gemini")),
    meta: Boolean(getApiKey("meta")),
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  }));

  ipcMain.handle("secrets:set", (_event, provider, apiKey) => {
    if (provider !== "gemini" && provider !== "meta") throw new Error("INVALID_PROVIDER");
    const value = String(apiKey || "").trim();
    if (!value) throw new Error("EMPTY_API_KEY");
    const data = loadData();
    data.secrets[provider] = encryptSecret(value);
    saveData(data);
    return true;
  });

  ipcMain.handle("secrets:clear", (_event, provider) => {
    if (provider !== "gemini" && provider !== "meta") throw new Error("INVALID_PROVIDER");
    const data = loadData();
    delete data.secrets[provider];
    saveData(data);
    return true;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
