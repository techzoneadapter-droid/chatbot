const { app, BrowserWindow, WebContentsView, ipcMain, session, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  DEFAULT_START_URL,
  normalizeUrl,
  isSupportedChatUrl,
  cleanUserAgent,
  snapshotSignature,
  boundedText
} = require("./browser-utils");

const SIDEBAR_WIDTH = 260;
const AI_PANEL_WIDTH = 360;
const TOPBAR_HEIGHT = 54;
const AUTO_POLL_MS = 2500;
const AUTO_COOLDOWN_MS = 7000;
const MAX_AUTO_PER_MINUTE = 6;
const MIN_AUTO_CONFIDENCE = 0.72;

let mainWindow = null;
let browserView = null;
let activeProfileId = null;
let autoTimer = null;
let persistUrlTimer = null;
const lastAutoSentAt = new Map();
const autoMinuteBuckets = new Map();
const autoConversationState = new Map();
const autoBusyProfiles = new Set();

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

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    startUrl: profile.startUrl || DEFAULT_START_URL,
    lastUrl: profile.lastUrl || profile.startUrl || DEFAULT_START_URL,
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
    lastUrl: typeof patch.lastUrl === "string" ? normalizeUrl(patch.lastUrl) : current.lastUrl,
    aiProvider: patch.aiProvider === "meta" ? "meta" : patch.aiProvider === "gemini" ? "gemini" : current.aiProvider,
    aiModel: typeof patch.aiModel === "string" ? patch.aiModel.trim().slice(0, 140) : current.aiModel,
    knowledge: typeof patch.knowledge === "string" ? patch.knowledge.slice(0, 30000) : current.knowledge,
    systemPrompt: typeof patch.systemPrompt === "string" ? patch.systemPrompt.slice(0, 6000) : current.systemPrompt,
    autoReply: typeof patch.autoReply === "boolean" ? patch.autoReply : current.autoReply
  };
  data.profiles[index] = next;
  saveData(data);
  if (typeof patch.autoReply === "boolean" && Boolean(current.autoReply) !== Boolean(next.autoReply)) {
    resetProfileAutoState(profileId);
  }
  return publicProfile(next);
}

function persistProfileLastUrl(profileId, value) {
  if (!profileId || !/^https?:\/\//i.test(String(value || ""))) return;
  const data = loadData();
  const index = data.profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) return;
  if (data.profiles[index].lastUrl === value) return;
  data.profiles[index].lastUrl = value;
  saveData(data);
}

function schedulePersistLastUrl(profileId, value) {
  if (persistUrlTimer) clearTimeout(persistUrlTimer);
  persistUrlTimer = setTimeout(() => persistProfileLastUrl(profileId, value), 500);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#0b0d10",
    title: "PageBot Desktop DEV",
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
  const old = browserView;
  browserView = null;
  try {
    mainWindow?.contentView.removeChildView(old);
  } catch {}
  try {
    old.webContents.close();
  } catch {}
}

async function openProfile(profileId) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  stopAutoLoop();
  destroyBrowserView();
  activeProfileId = profileId;
  resetProfileAutoState(profileId);

  const partition = `persist:pagebot-${profileId}`;
  const nextView = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  browserView = nextView;
  mainWindow.contentView.addChildView(nextView);
  setBrowserBounds();

  const compatibleUserAgent = cleanUserAgent(nextView.webContents.getUserAgent());
  if (compatibleUserAgent) nextView.webContents.setUserAgent(compatibleUserAgent);

  nextView.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && browserView === nextView) nextView.webContents.loadURL(url).catch(() => {});
    return { action: "deny" };
  });

  const onNavigation = (url) => {
    if (browserView !== nextView || activeProfileId !== profileId) return;
    sendEvent("browser-state", { url, supportedChat: isSupportedChatUrl(url) });
    schedulePersistLastUrl(profileId, url);
  };

  nextView.webContents.on("did-navigate", (_event, url) => onNavigation(url));
  nextView.webContents.on("did-navigate-in-page", (_event, url) => onNavigation(url));
  nextView.webContents.on("page-title-updated", (_event, title) => {
    if (browserView === nextView) sendEvent("browser-state", { title });
  });
  nextView.webContents.on("did-start-loading", () => {
    if (browserView === nextView) sendEvent("browser-state", { loading: true });
  });
  nextView.webContents.on("did-stop-loading", () => {
    if (browserView !== nextView) return;
    const url = nextView.webContents.getURL();
    sendEvent("browser-state", { loading: false, url, supportedChat: isSupportedChatUrl(url) });
    schedulePersistLastUrl(profileId, url);
  });
  nextView.webContents.on("render-process-gone", (_event, details) => {
    if (browserView === nextView) sendEvent("log", { level: "error", text: `Browser profile dừng: ${details.reason}` });
  });

  const initialUrl = profile.lastUrl || profile.startUrl || DEFAULT_START_URL;
  await nextView.webContents.loadURL(initialUrl);
  if (browserView !== nextView || activeProfileId !== profileId) return null;

  sendEvent("active-profile", publicProfile({ ...profile, lastUrl: nextView.webContents.getURL() || initialUrl }));
  sendEvent("log", {
    level: "info",
    text: profile.autoReply
      ? "Auto Chat đang bật nhưng sẽ lấy hội thoại hiện tại làm mốc trước, không trả lời lại tin cũ."
      : "Profile đã sẵn sàng."
  });
  startAutoLoop();
  return publicProfile({ ...profile, lastUrl: nextView.webContents.getURL() || initialUrl });
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

function resetProfileAutoState(profileId) {
  autoConversationState.delete(profileId);
  autoBusyProfiles.delete(profileId);
  lastAutoSentAt.delete(profileId);
  autoMinuteBuckets.delete(profileId);
}

function getConversationAutoState(profileId) {
  let value = autoConversationState.get(profileId);
  if (!value) {
    value = new Map();
    autoConversationState.set(profileId, value);
  }
  return value;
}

async function autoTick() {
  const profileId = activeProfileId;
  const view = browserView;
  if (!view || !profileId || autoBusyProfiles.has(profileId)) return;

  const profile = getProfile(profileId);
  if (!profile?.autoReply || view.webContents.isLoading()) return;
  if (!isSupportedChatUrl(view.webContents.getURL())) return;

  try {
    const snapshot = await captureChatSnapshot(view);
    if (browserView !== view || activeProfileId !== profileId) return;
    if (!snapshot?.inputFound || !snapshot.latestText) return;

    const conversationKey = snapshot.conversationKey || snapshot.url || "current-chat";
    const signature = snapshotSignature(snapshot);
    const states = getConversationAutoState(profileId);
    let current = states.get(conversationKey);

    if (!current) {
      states.set(conversationKey, { seenSignature: signature, pendingSignature: "", stableCount: 0, handledSignature: "" });
      sendEvent("log", { level: "info", text: `Auto Chat đã lấy mốc hội thoại “${snapshot.title || "đang mở"}”.` });
      return;
    }

    if (signature === current.seenSignature || signature === current.handledSignature) {
      current.pendingSignature = "";
      current.stableCount = 0;
      return;
    }

    if (current.pendingSignature !== signature) {
      current.pendingSignature = signature;
      current.stableCount = 1;
      return;
    }

    current.stableCount += 1;
    if (current.stableCount < 2) return;

    current.seenSignature = signature;
    current.pendingSignature = "";
    current.stableCount = 0;

    if (!snapshot.incoming) return;
    if ((snapshot.confidence || 0) < MIN_AUTO_CONFIDENCE) {
      sendEvent("log", { level: "warn", text: `Có tin mới nhưng độ tin cậy đọc hội thoại thấp (${Math.round((snapshot.confidence || 0) * 100)}%). Auto chưa gửi.` });
      return;
    }

    const now = Date.now();
    const lastSent = lastAutoSentAt.get(profileId) || 0;
    if (now - lastSent < AUTO_COOLDOWN_MS) return;
    if (!consumeAutoQuota(profileId, now)) {
      sendEvent("log", { level: "warn", text: "Auto Chat tạm dừng vì đạt giới hạn 6 tin/phút." });
      return;
    }

    current.handledSignature = signature;
    autoBusyProfiles.add(profileId);
    sendEvent("auto-state", { busy: true, conversationKey });
    sendEvent("log", { level: "info", text: `Tin khách mới: ${snapshot.latestText.slice(0, 120)}` });

    const reply = await generateAIReply(profile, snapshot);
    if (!reply) return;
    if (browserView !== view || activeProfileId !== profileId) {
      sendEvent("log", { level: "warn", text: "Đã đổi profile trong lúc AI soạn nên câu trả lời cũ không được gửi." });
      return;
    }

    const latestBeforeSend = await captureChatSnapshot(view);
    if (!latestBeforeSend || (latestBeforeSend.conversationKey || latestBeforeSend.url) !== conversationKey || snapshotSignature(latestBeforeSend) !== signature) {
      sendEvent("log", { level: "warn", text: "Hội thoại đã có thay đổi trong lúc AI soạn. Bỏ câu trả lời cũ để tránh gửi sai ngữ cảnh." });
      return;
    }

    const result = await sendChatText(view, reply);
    if (result.ok) {
      lastAutoSentAt.set(profileId, Date.now());
      sendEvent("ai-reply", { text: reply, automatic: true, title: snapshot.title || "", profileId, verified: result.verified });
      sendEvent("log", { level: result.verified ? "success" : "warn", text: result.verified ? `Đã tự động trả lời: ${reply.slice(0, 120)}` : "Đã thực hiện thao tác gửi nhưng chưa xác nhận được bong bóng tin nhắn mới. Hãy kiểm tra màn hình." });
    } else {
      sendEvent("log", { level: "warn", text: `AI đã soạn nhưng chưa gửi được: ${result.reason || "không tìm thấy nút gửi"}.` });
      sendEvent("ai-reply", { text: reply, automatic: false, title: snapshot.title || "", profileId, verified: false });
    }
  } catch (error) {
    sendEvent("log", { level: "error", text: safeMessage(error) });
  } finally {
    autoBusyProfiles.delete(profileId);
    sendEvent("auto-state", { busy: false });
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

async function captureChatSnapshot(view = browserView) {
  if (!view || view.webContents.isDestroyed()) return null;
  const supportedChat = isSupportedChatUrl(view.webContents.getURL());
  const script = `(() => {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity || 1) > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const inputs = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], div[contenteditable="true"], textarea'))
      .filter(visible)
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(x => x.r.width > 180 && x.r.top > innerHeight * 0.35)
      .sort((a,b) => b.r.bottom - a.r.bottom || b.r.width - a.r.width);
    const input = inputs[0];
    if (!input) return { inputFound: false, latestText: '', incoming: false, history: [], messages: [], title: document.title, url: location.href, confidence: 0 };

    const inputRect = input.r;
    const center = inputRect.left + inputRect.width / 2;
    const minTop = Math.max(0, inputRect.top - Math.min(1200, innerHeight * 1.35));
    const leftLimit = Math.max(0, inputRect.left - Math.min(120, inputRect.width * 0.18));
    const rightLimit = Math.min(innerWidth, inputRect.right + Math.min(120, inputRect.width * 0.18));
    const selector = '[dir="auto"], [data-testid*="message"], [role="row"], [role="listitem"]';
    const skip = /^(Gửi|Send|Đã xem|Seen|Like|Thích|Reply|Trả lời|Enter|Nhấn Enter|Message|Tin nhắn|More|Xem thêm|Forward|Chuyển tiếp|Actions|Hành động)$/i;
    const candidates = Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .map(el => ({ el, text: clean(el.innerText || el.textContent), r: el.getBoundingClientRect() }))
      .filter(x => x.text && x.text.length <= 1500 && !skip.test(x.text))
      .filter(x => x.r.bottom < inputRect.top - 3 && x.r.top > minTop)
      .filter(x => x.r.right > leftLimit && x.r.left < rightLimit)
      .filter(x => x.r.width < inputRect.width * 0.96 || x.r.height < 110)
      .sort((a,b) => a.r.bottom - b.r.bottom || a.r.left - b.r.left);

    const normalized = [];
    const seen = new Set();
    for (const item of candidates) {
      const key = item.text;
      const rectKey = Math.round(item.r.left / 8) + ':' + Math.round(item.r.top / 8) + ':' + key;
      if (seen.has(rectKey)) continue;
      const duplicate = normalized.some(existing => existing.text === key && Math.abs(existing.bottom - item.r.bottom) < 12);
      if (duplicate) continue;
      seen.add(rectKey);
      const mid = (item.r.left + item.r.right) / 2;
      const offset = (mid - center) / Math.max(1, inputRect.width);
      const direction = offset < -0.06 ? 'incoming' : offset > 0.06 ? 'outgoing' : 'unknown';
      normalized.push({ text: key, direction, left: Math.round(item.r.left), right: Math.round(item.r.right), bottom: Math.round(item.r.bottom) });
    }

    const directional = normalized.filter(item => item.direction !== 'unknown');
    const messages = (directional.length ? directional : normalized).slice(-16);
    const latest = messages[messages.length - 1] || null;

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .filter(visible)
      .map(el => ({ text: clean(el.innerText || el.textContent), r: el.getBoundingClientRect() }))
      .filter(x => x.text && x.text.length < 120 && x.r.bottom < inputRect.top && x.r.right > leftLimit && x.r.left < rightLimit)
      .sort((a,b) => b.r.bottom - a.r.bottom);

    const u = new URL(location.href);
    const keyParam = ['selected_item_id','thread_id','conversation_id','selected_item','id'].map(name => u.searchParams.get(name)).find(Boolean);
    const pathThread = u.pathname.match(/\\/(?:t|messages\\/t)\\/([^/?#]+)/i)?.[1] || '';
    const title = headings[0]?.text || document.title || '';
    const conversationKey = keyParam || pathThread || (title ? u.hostname + '|' + title : location.href.split('#')[0]);
    const incoming = latest?.direction === 'incoming';
    let confidence = 0.30;
    if (latest?.text) confidence += 0.22;
    if (latest?.direction && latest.direction !== 'unknown') confidence += 0.24;
    if (messages.length >= 2) confidence += 0.10;
    if (conversationKey) confidence += 0.06;

    return {
      inputFound: true,
      latestText: latest?.text || '',
      latestDirection: latest?.direction || 'unknown',
      incoming,
      history: messages.map(x => (x.direction === 'incoming' ? 'Khách: ' : x.direction === 'outgoing' ? 'Bạn/Page: ' : '') + x.text).slice(-12),
      messages: messages.map(x => ({ text: x.text, direction: x.direction })),
      messageCount: messages.length,
      title,
      conversationKey,
      url: location.href,
      confidence: Math.min(0.92, confidence)
    };
  })()`;
  const snapshot = await view.webContents.executeJavaScript(script, true);
  return { ...snapshot, supportedChat, confidence: Math.min(1, Number(snapshot?.confidence || 0) + (supportedChat ? 0.08 : 0)) };
}

async function sendChatText(view = browserView, text) {
  if (!view || view.webContents.isDestroyed() || !boundedText(text, 4000)) return { ok: false, verified: false, reason: "EMPTY_OR_NO_BROWSER" };
  if (!isSupportedChatUrl(view.webContents.getURL())) return { ok: false, verified: false, reason: "UNSUPPORTED_CHAT_URL" };

  const value = boundedText(text, 4000);
  const serialized = JSON.stringify(value);
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
      .filter(x => x.r.width > 180 && x.r.top > innerHeight * 0.35)
      .sort((a,b) => b.r.bottom - a.r.bottom || b.r.width - a.r.width)[0]?.el;
    if (!input) return { ok: false, method: '', reason: 'COMPOSER_NOT_FOUND' };
    const value = ${serialized};
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, value); } catch {}
      if (!inserted) {
        input.textContent = value;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      }
    }

    const ir = input.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter(visible)
      .map(el => {
        const r = el.getBoundingClientRect();
        const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.innerText].filter(Boolean).join(' ').trim();
        const distance = Math.abs(r.left - ir.right) + Math.abs(r.top - ir.top);
        return { el, r, label, distance };
      })
      .filter(x => /(^|\\s)(send|gửi)(\\s|$)/i.test(x.label))
      .filter(x => x.r.top > ir.top - 120 && x.r.bottom < ir.bottom + 160)
      .sort((a,b) => a.distance - b.distance);
    if (buttons[0]) {
      buttons[0].el.click();
      return { ok: true, method: 'button', reason: '' };
    }

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return { ok: true, method: 'enter', reason: '' };
  })()`;

  const result = await view.webContents.executeJavaScript(script, true);
  if (!result?.ok) return { ok: false, verified: false, reason: result?.reason || "SEND_FAILED", method: result?.method || "" };

  await sleep(900);
  if (view.webContents.isDestroyed()) return { ok: true, verified: false, method: result.method };
  try {
    const after = await captureChatSnapshot(view);
    const normalizedNeedle = value.replace(/\s+/g, " ").trim().slice(0, 120);
    const verified = Boolean(after?.messages?.slice(-4).some((message) => message.direction === "outgoing" && String(message.text || "").replace(/\s+/g, " ").includes(normalizedNeedle)));
    return { ok: true, verified, method: result.method };
  } catch {
    return { ok: true, verified: false, method: result.method };
  }
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

  const reply = provider === "meta"
    ? await callMeta(apiKey, model, system, user)
    : await callGemini(apiKey, model, system, user);
  return boundedText(reply, 3500);
}

async function testAI(profile) {
  const fakeSnapshot = {
    title: "Kiểm tra kết nối",
    history: ["Khách: Xin chào"],
    latestText: "Xin chào"
  };
  const started = Date.now();
  const text = await generateAIReply(profile, fakeSnapshot);
  return { ok: Boolean(text), latencyMs: Date.now() - started, preview: boundedText(text, 180) };
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
  return message
    .replace(/AIza[\w-]+/g, "[API_KEY]")
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [REDACTED]")
    .replace(/MODEL_API_KEY=[^\s&]+/gi, "MODEL_API_KEY=[REDACTED]")
    .slice(0, 700);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerIpc() {
  ipcMain.handle("profiles:list", () => loadData().profiles.map(publicProfile));

  ipcMain.handle("profiles:create", async (_event, input = {}) => {
    const data = loadData();
    const profile = {
      id: crypto.randomUUID(),
      name: String(input.name || `Profile ${data.profiles.length + 1}`).trim().slice(0, 80),
      startUrl: normalizeUrl(input.startUrl || DEFAULT_START_URL),
      lastUrl: normalizeUrl(input.startUrl || DEFAULT_START_URL),
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
      stopAutoLoop();
      destroyBrowserView();
      activeProfileId = null;
    }
    try {
      await session.fromPartition(`persist:pagebot-${profileId}`).clearStorageData();
    } catch {}
    const data = loadData();
    data.profiles = data.profiles.filter((item) => item.id !== profileId);
    saveData(data);
    resetProfileAutoState(profileId);
    return true;
  });

  ipcMain.handle("profile:open", (_event, profileId) => openProfile(profileId));
  ipcMain.handle("browser:back", () => browserView?.webContents.canGoBack() ? browserView.webContents.goBack() : null);
  ipcMain.handle("browser:forward", () => browserView?.webContents.canGoForward() ? browserView.webContents.goForward() : null);
  ipcMain.handle("browser:reload", () => browserView?.webContents.reload());
  ipcMain.handle("browser:home", async () => {
    const profile = activeProfileId ? getProfile(activeProfileId) : null;
    if (browserView && profile) await browserView.webContents.loadURL(profile.startUrl || DEFAULT_START_URL);
  });
  ipcMain.handle("browser:navigate", async (_event, url) => {
    if (!browserView) return false;
    await browserView.webContents.loadURL(normalizeUrl(url));
    return true;
  });
  ipcMain.handle("browser:state", () => browserView ? {
    url: browserView.webContents.getURL(),
    title: browserView.webContents.getTitle(),
    supportedChat: isSupportedChatUrl(browserView.webContents.getURL())
  } : { url: "", title: "", supportedChat: false });

  ipcMain.handle("chat:snapshot", () => captureChatSnapshot(browserView));
  ipcMain.handle("chat:send", async (_event, text) => {
    const profileId = activeProfileId;
    const view = browserView;
    const result = await sendChatText(view, String(text || ""));
    return { ...result, profileId };
  });

  ipcMain.handle("ai:suggest", async () => {
    const profileId = activeProfileId;
    const view = browserView;
    if (!profileId || !view) throw new Error("Chưa mở profile.");
    const profile = getProfile(profileId);
    if (!profile) throw new Error("Profile không tồn tại.");
    if (!isSupportedChatUrl(view.webContents.getURL())) throw new Error("Hãy mở Business Suite Inbox hoặc Messenger trước khi AI đọc hội thoại.");
    const snapshot = await captureChatSnapshot(view);
    if (activeProfileId !== profileId || browserView !== view) throw new Error("PROFILE_CHANGED");
    if (!snapshot?.inputFound) throw new Error("Không tìm thấy ô chat trên trang đang mở.");
    if (!snapshot.latestText) throw new Error("Chưa đọc được tin nhắn hiện tại.");
    const text = await generateAIReply(profile, snapshot);
    return { text, snapshot, profileId };
  });

  ipcMain.handle("ai:test", async () => {
    if (!activeProfileId) throw new Error("Chưa mở profile.");
    const profile = getProfile(activeProfileId);
    if (!profile) throw new Error("Profile không tồn tại.");
    return { ...(await testAI(profile)), profileId: activeProfileId, provider: profile.aiProvider, model: profile.aiModel };
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
