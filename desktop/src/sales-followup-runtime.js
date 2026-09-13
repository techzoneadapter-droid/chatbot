"use strict";

const { app, ipcMain, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeSalesState } = require("./sales-followup-policy");

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
}

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), "utf8"));
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      secrets: parsed.secrets && typeof parsed.secrets === "object" ? parsed.secrets : {}
    };
  } catch {
    return { profiles: [], secrets: {} };
  }
}

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}

function getProfile(profileId) {
  return loadData().profiles.find((item) => item.id === profileId) || null;
}

function apiKeyFor(provider) {
  const data = loadData();
  return decryptSecret(data.secrets?.[provider]) || "";
}

function compactMessages(snapshot) {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages.slice(-24) : [];
  if (messages.length) {
    return messages.map((item) => `${item.direction === "incoming" ? "Khách" : "Page"}: ${String(item.text || "").trim()}`).filter((x) => !x.endsWith(": ")).join("\n");
  }
  return Array.isArray(snapshot?.history) ? snapshot.history.slice(-24).join("\n") : String(snapshot?.latestText || "");
}

function extractJson(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI không trả về trạng thái bán hàng hợp lệ.");
  return JSON.parse(raw.slice(start, end + 1));
}

function promptFor(profile, snapshot, mode) {
  const transcript = compactMessages(snapshot);
  const knowledge = String(profile.knowledge || "").slice(0, 12000);
  const custom = String(profile.systemPrompt || "").slice(0, 3000);
  return `Bạn là bộ điều phối bán hàng cho Page Facebook. Phân tích hội thoại và trả JSON duy nhất, không markdown.\n\nQUY TẮC:\n- Đọc cả tin cũ, không chỉ tin cuối.\n- Mục tiêu là tư vấn, chốt nhu cầu, xin thông tin giao hàng và xác nhận đơn.\n- Một đơn chỉ đủ dữ liệu khi có: sản phẩm/biến thể/số lượng cần thiết, tên người nhận, số điện thoại, địa chỉ giao hàng.\n- Nếu thiếu dữ liệu, hỏi ngắn gọn đúng phần còn thiếu, ưu tiên mỗi lần 1-2 mục.\n- Nếu khách đã đưa SĐT hoặc Zalo nhưng chưa chốt đơn, xác nhận đã nhận thông tin và nói bên Page sẽ liên hệ/kết bạn sớm nhất; không tự nhận đã liên hệ.\n- Nếu đã đủ dữ liệu đơn nhưng chưa thấy khách xác nhận sau một bản tóm tắt, phải tóm tắt lại đơn và hỏi khách xác nhận.\n- Chỉ khi khách đã xác nhận rõ ràng thông tin đơn thì status=order_confirmed. Khi đó reply nói đã ghi nhận/xác nhận đơn, KHÔNG nói đã lên đơn trên hệ thống vì app chưa có API tạo đơn.\n- Nếu đã hoàn tất và không còn việc cần hỏi thì shouldFollowUp=false.\n- Không bịa giá, hàng, phí ship, ưu đãi, tên, SĐT, địa chỉ hay sản phẩm.\n- Nếu khách từ chối hoặc không còn nhu cầu thì status=done, shouldFollowUp=false.\n- mode=${mode}. Nếu mode=followup_old, hãy chủ động nối lại hội thoại cũ một cách tự nhiên, không nói 'tin cũ' hay 'hệ thống nhắc'.\n\nSTATUS hợp lệ: new, consulting, need_phone, need_name, need_address, need_order_details, need_confirmation, contact_promised, order_confirmed, done.\n\nJSON schema:\n{"status":"...","hasPhone":true,"hasZalo":false,"hasName":false,"hasAddress":false,"hasOrderIntent":true,"hasOrderDetails":false,"orderConfirmed":false,"missingFields":["phone"],"summary":"...","nextAction":"...","shouldFollowUp":true,"reply":"..."}\n\nDỮ LIỆU RIÊNG:\n${knowledge || "(chưa có)"}\n${custom ? `\nCHỈ DẪN RIÊNG:\n${custom}` : ""}\n\nHỘI THOẠI ${snapshot?.title ? `VỚI ${snapshot.title}` : ""}:\n${transcript}\n\nTrả JSON duy nhất.`;
}

async function callGemini(apiKey, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 850, responseMimeType: "application/json" }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
    return payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
  } finally {
    clearTimeout(timer);
  }
}

async function callMeta(apiKey, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2 })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Meta Model API HTTP ${response.status}: ${payload?.error?.message || payload?.message || "request failed"}`);
    const content = payload?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : "";
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle("sales:analyze-followup", async (_event, profileId, snapshot, mode = "new_message") => {
  const profile = getProfile(profileId);
  if (!profile) throw new Error("Profile không tồn tại.");
  const provider = profile.aiProvider === "meta" ? "meta" : "gemini";
  const apiKey = apiKeyFor(provider);
  if (!apiKey) throw new Error(`${provider === "meta" ? "Meta Model API" : "Gemini"} chưa có API key.`);
  const model = String(profile.aiModel || "").trim();
  if (!model) throw new Error("Chưa cấu hình Model ID.");

  const prompt = promptFor(profile, snapshot || {}, mode === "followup_old" ? "followup_old" : "new_message");
  const raw = provider === "meta" ? await callMeta(apiKey, model, prompt) : await callGemini(apiKey, model, prompt);
  const parsed = extractJson(raw);
  const state = normalizeSalesState(parsed);
  return { ...state, reply: String(parsed.reply || "").trim().slice(0, 3500) };
});
