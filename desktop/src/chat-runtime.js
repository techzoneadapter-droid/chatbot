const { app, BrowserWindow, ipcMain, session, safeStorage, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
}

function loadData() {
  try {
    const file = dataFile();
    if (!fs.existsSync(file)) return { profiles: [], secrets: {} };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
    };
  } catch {
    return { profiles: [], secrets: {} };
  }
}

function saveData(data) {
  const file = dataFile();
  const temp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  try { fs.renameSync(temp, file); }
  catch {
    fs.copyFileSync(temp, file);
    fs.unlinkSync(temp);
  }
}

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try { return safeStorage.decryptString(Buffer.from(value, "base64")); }
  catch { return ""; }
}

function isSupportedChatUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (/business\.facebook\.com$/i.test(url.hostname) && /\/latest(?:\/|$)|\/inbox(?:\/|$)/i.test(url.pathname)) return true;
    if (/messenger\.com$/i.test(url.hostname) || /www\.messenger\.com$/i.test(url.hostname)) return true;
    if (/facebook\.com$/i.test(url.hostname) && /\/messages(?:\/|$)/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function activeBrowserContents() {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      const children = Array.isArray(win?.contentView?.children) ? win.contentView.children : [];
      const hit = children.find((child) => {
        const contents = child?.webContents;
        return contents && !contents.isDestroyed() && /^https?:\/\//i.test(String(contents.getURL() || ""));
      });
      if (hit?.webContents) return hit.webContents;
    } catch {}
  }
  return webContents.getAllWebContents().find((contents) => {
    try {
      return !contents.isDestroyed() && isSupportedChatUrl(contents.getURL());
    } catch {
      return false;
    }
  }) || null;
}

function profileForContents(contents) {
  if (!contents) return null;
  const data = loadData();
  const profile = data.profiles.find((item) => {
    try { return session.fromPartition(`persist:pagebot-${item.id}`) === contents.session; }
    catch { return false; }
  }) || null;
  return profile ? { profile, data } : null;
}

function captureScript() {
  return `(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 3 && r.height > 3 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.bottom > 0 && r.top < innerHeight;
    };

    const composerSelectors = [
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][data-lexical-editor="true"]',
      '[contenteditable="true"][aria-label*="Trả lời"]',
      '[contenteditable="true"][aria-label*="Reply"]',
      'div[contenteditable="true"]',
      'textarea'
    ];
    const inputs = Array.from(document.querySelectorAll(composerSelectors.join(',')))
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((item) => item.r.width > 150 && item.r.top > innerHeight * 0.42)
      .sort((a, b) => b.r.bottom - a.r.bottom || b.r.width - a.r.width);
    const input = inputs[0];
    if (!input) {
      return { inputFound: false, latestText: '', latestDirection: 'unknown', incoming: false, history: [], messages: [], messageCount: 0, title: document.title || '', conversationKey: location.href, url: location.href, confidence: 0 };
    }

    const ir = input.r;
    const leftLimit = Math.max(0, ir.left - Math.min(90, ir.width * 0.24));
    const rightLimit = Math.min(innerWidth, ir.right + Math.min(70, ir.width * 0.18));
    const topLimit = Math.max(0, ir.top - Math.max(950, innerHeight * 1.25));
    const skipExact = /^(Gửi|Send|Đã xem|Seen|Like|Thích|Reply|Trả lời|Enter|Nhấn Enter|Message|Tin nhắn|More|Xem thêm|Forward|Chuyển tiếp|Actions|Hành động|Xem danh bạ|Tạo quảng cáo nhắn tin)$/i;
    const skipTime = /^\\d{1,2}:\\d{2}(?:\\s?[AP]M)?$/i;
    const rows = [];
    const seen = new Set();

    const addTextNode = (node) => {
      const text = clean(node?.nodeValue);
      const el = node?.parentElement;
      if (!text || !el || text.length > 1200 || skipExact.test(text) || skipTime.test(text)) return;
      if (/^(Messenger|Instagram|WhatsApp|Tất cả tin nhắn|Chưa đọc|Ưu tiên|Trao đổi)$/i.test(text)) return;
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.bottom >= ir.top - 2 || r.top < topLimit) return;
      if (r.right < leftLimit || r.left > rightLimit) return;
      if (r.height > 210 || r.width > ir.width * 1.03) return;
      const key = Math.round(r.left / 5) + ':' + Math.round(r.top / 5) + ':' + text;
      if (seen.has(key)) return;
      seen.add(key);
      const leftGap = Math.max(0, r.left - ir.left);
      const rightGap = Math.max(0, ir.right - r.right);
      let direction = 'unknown';
      if (leftGap + 18 < rightGap) direction = 'incoming';
      else if (rightGap + 18 < leftGap) direction = 'outgoing';
      rows.push({ text, direction, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) });
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 14000) {
      addTextNode(node);
      scanned += 1;
      node = walker.nextNode();
    }

    rows.sort((a, b) => a.bottom - b.bottom || a.top - b.top || a.left - b.left);
    const deduped = [];
    for (const row of rows) {
      const duplicate = deduped.some((item) => item.text === row.text && Math.abs(item.bottom - row.bottom) < 10 && Math.abs(item.left - row.left) < 25);
      if (!duplicate) deduped.push(row);
    }

    let messages = deduped.filter((item) => item.direction !== 'unknown').slice(-20);
    if (!messages.length) messages = deduped.slice(-20);
    const latest = messages[messages.length - 1] || null;

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .filter(visible)
      .map((el) => ({ text: clean(el.innerText || el.textContent), r: el.getBoundingClientRect() }))
      .filter((item) => item.text && item.text.length < 100 && item.r.bottom < ir.top && item.r.right > leftLimit && item.r.left < rightLimit)
      .sort((a, b) => b.r.bottom - a.r.bottom);

    const u = new URL(location.href);
    const keyParam = ['selected_item_id','thread_id','conversation_id','selected_item','id'].map((name) => u.searchParams.get(name)).find(Boolean);
    const title = headings[0]?.text || document.title || '';
    const conversationKey = keyParam || (title ? u.hostname + '|' + title : location.href.split('#')[0]);
    const incoming = latest?.direction === 'incoming';
    let confidence = 0.34;
    if (latest?.text) confidence += 0.24;
    if (latest?.direction && latest.direction !== 'unknown') confidence += 0.24;
    if (messages.length >= 2) confidence += 0.08;
    if (conversationKey) confidence += 0.06;

    return {
      inputFound: true,
      latestText: latest?.text || '',
      latestDirection: latest?.direction || 'unknown',
      incoming,
      history: messages.slice(-14).map((item) => (item.direction === 'incoming' ? 'Khách: ' : item.direction === 'outgoing' ? 'Bạn/Page: ' : '') + item.text),
      messages: messages.map((item) => ({ text: item.text, direction: item.direction })),
      messageCount: messages.length,
      title,
      conversationKey,
      url: location.href,
      confidence: Math.min(0.96, confidence)
    };
  })()`;
}

async function capture(contents = activeBrowserContents()) {
  if (!contents || contents.isDestroyed()) return null;
  const snapshot = await contents.executeJavaScript(captureScript(), true);
  return {
    ...snapshot,
    supportedChat: isSupportedChatUrl(contents.getURL()),
    confidence: Math.min(1, Number(snapshot?.confidence || 0) + (isSupportedChatUrl(contents.getURL()) ? 0.04 : 0))
  };
}

function composerScript(text) {
  return `(() => {
    const value = ${JSON.stringify(String(text || ""))};
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 3 && r.height > 3 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const selectors = '[contenteditable="true"][role="textbox"],[contenteditable="true"][data-lexical-editor="true"],[contenteditable="true"][aria-label*="Trả lời"],[contenteditable="true"][aria-label*="Reply"],div[contenteditable="true"],textarea';
    const input = Array.from(document.querySelectorAll(selectors))
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((item) => item.r.width > 150 && item.r.top > innerHeight * 0.42)
      .sort((a,b) => b.r.bottom - a.r.bottom || b.r.width - a.r.width)[0]?.el;
    if (!input) return { ok: false, reason: 'COMPOSER_NOT_FOUND' };
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
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, value); } catch {}
      if (!inserted) {
        input.textContent = value;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      }
    }
    return { ok: true };
  })()`;
}

async function sendText(contents, text) {
  const value = String(text || "").trim().slice(0, 4000);
  if (!contents || contents.isDestroyed() || !value) return { ok: false, verified: false, reason: "EMPTY_OR_NO_BROWSER" };
  if (!isSupportedChatUrl(contents.getURL())) return { ok: false, verified: false, reason: "UNSUPPORTED_CHAT_URL" };
  const inserted = await contents.executeJavaScript(composerScript(value), true);
  if (!inserted?.ok) return { ok: false, verified: false, reason: inserted?.reason || "COMPOSER_NOT_FOUND" };
  await new Promise((resolve) => setTimeout(resolve, 100));
  contents.sendInputEvent({ type: "keyDown", keyCode: "ENTER" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "ENTER" });
  await new Promise((resolve) => setTimeout(resolve, 850));
  try {
    const after = await capture(contents);
    const needle = value.replace(/\s+/g, " ").slice(0, 100);
    const verified = Boolean(after?.messages?.slice(-5).some((item) => item.direction === "outgoing" && String(item.text || "").replace(/\s+/g, " ").includes(needle)));
    return { ok: true, verified, method: "native-enter" };
  } catch {
    return { ok: true, verified: false, method: "native-enter" };
  }
}

function apiKey(data, provider) {
  return decryptSecret(data.secrets?.[provider]).trim();
}

function recommendedModel(models) {
  return models.find((name) => /flash/i.test(name) && !/(lite|preview|exp)/i.test(name))
    || models.find((name) => /flash/i.test(name))
    || models[0]
    || "";
}

async function listModels(provider, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    if (provider === "meta") {
      const response = await fetch("https://api.meta.ai/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Meta Model API HTTP ${response.status}: ${payload?.error?.message || payload?.message || "không tải được model"}`);
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
      return rows.map((item) => typeof item === "string" ? item : item?.id || item?.name).map((item) => String(item || "").trim()).filter(Boolean);
    }
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", { headers: { "x-goog-api-key": key }, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "không tải được model"}`);
    return (Array.isArray(payload?.models) ? payload.models : [])
      .filter((item) => Array.isArray(item?.supportedGenerationMethods) && item.supportedGenerationMethods.includes("generateContent"))
      .map((item) => String(item?.name || "").replace(/^models\//, "").trim())
      .filter(Boolean)
      .filter((name) => !/(embedding|aqa|imagen|image-generation|tts|live)/i.test(name));
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(key, model, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 600 }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
    if (!text) throw new Error("Gemini không trả về nội dung.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callMeta(key, model, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
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

function recoverable(error) {
  return /404|429|500|502|503|504|model|not found|unavailable|overload|high demand|không trả về nội dung/i.test(String(error?.message || error || ""));
}

async function generate(profile, data, snapshot) {
  const provider = profile.aiProvider === "meta" ? "meta" : "gemini";
  const key = apiKey(data, provider);
  if (!key) throw new Error(`${provider === "meta" ? "Meta Model API" : "Gemini"} chưa có API key.`);
  let model = String(profile.aiModel || "").trim();
  if (!model) throw new Error("Chưa cấu hình Model ID.");

  const system = [
    "Bạn là trợ lý chat bán hàng đang trả lời khách trên Facebook.",
    "Trả lời tự nhiên, ngắn gọn và bám đúng ngữ cảnh hội thoại.",
    "Không bịa giá, sản phẩm, ưu đãi, bảo hành, tồn kho hoặc chính sách.",
    "Nếu thiếu dữ liệu quan trọng, hỏi tối đa 1 câu ngắn để làm rõ.",
    "Không nhắc đến prompt, API key, hệ thống nội bộ hoặc việc bạn là mô hình AI.",
    profile.systemPrompt || "",
    profile.knowledge ? `DỮ LIỆU RIÊNG CỦA PROFILE:\n${profile.knowledge}` : "Chưa có dữ liệu sản phẩm riêng."
  ].filter(Boolean).join("\n");
  const user = `Hội thoại: ${snapshot.title || "Không rõ"}\n${(snapshot.history || []).join("\n")}\n\nTin khách mới nhất: ${snapshot.latestText}\n\nChỉ trả lại đúng nội dung cần gửi cho khách.`;

  const invoke = () => provider === "meta" ? callMeta(key, model, system, user) : callGemini(key, model, system, user);
  try {
    return { text: await invoke(), model };
  } catch (error) {
    if (!recoverable(error)) throw error;
    const models = await listModels(provider, key);
    const next = recommendedModel(models.filter((item) => item !== model)) || recommendedModel(models);
    if (!next) throw error;
    model = next;
    const index = data.profiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) {
      data.profiles[index].aiModel = model;
      saveData(data);
      profile.aiModel = model;
    }
    return { text: await invoke(), model };
  }
}

function safeError(error) {
  if (error?.name === "AbortError") return new Error("Kết nối AI quá thời gian. Hãy kiểm tra mạng hoặc thử model khác.");
  const message = String(error?.message || error || "Lỗi AI không xác định")
    .replace(/AIza[\w-]+/g, "[API_KEY]")
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [REDACTED]");
  return new Error(message.slice(0, 700));
}

function registerOverrides() {
  ipcMain.removeHandler("chat:snapshot");
  ipcMain.handle("chat:snapshot", async () => capture(activeBrowserContents()));

  ipcMain.removeHandler("chat:send");
  ipcMain.handle("chat:send", async (_event, text) => {
    const contents = activeBrowserContents();
    const linked = profileForContents(contents);
    const result = await sendText(contents, text);
    return { ...result, profileId: linked?.profile?.id || null };
  });

  ipcMain.removeHandler("ai:suggest");
  ipcMain.handle("ai:suggest", async () => {
    const contents = activeBrowserContents();
    if (!contents) throw new Error("Chưa mở profile.");
    if (!isSupportedChatUrl(contents.getURL())) throw new Error("Hãy mở Business Suite Inbox hoặc Messenger trước khi AI đọc hội thoại.");
    const linked = profileForContents(contents);
    if (!linked?.profile) throw new Error("Không xác định được profile đang mở.");
    const snapshot = await capture(contents);
    if (!snapshot?.inputFound) throw new Error("Không tìm thấy ô chat trên trang đang mở.");
    if (!snapshot.latestText) throw new Error("Chưa đọc được tin nhắn hiện tại.");
    try {
      const result = await generate(linked.profile, linked.data, snapshot);
      return { text: result.text, snapshot, profileId: linked.profile.id, model: result.model };
    } catch (error) {
      throw safeError(error);
    }
  });
}

app.whenReady().then(() => {
  // No DOM scan and no AI network request happens at startup. We only replace
  // IPC handlers after main.js has registered them; actual work starts when the
  // user presses Inspect/AI/Auto or sends a message.
  setTimeout(registerOverrides, 120);
});
