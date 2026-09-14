"use strict";

const { app, ipcMain, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeSalesState } = require("./sales-followup-policy");

const DEFAULT_META_MODEL = "muse-spark-1.3";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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

function providerFor(profile) {
  return profile?.aiProvider === "meta" ? "meta" : "gemini";
}

function apiKeyFor(provider) {
  const data = loadData();
  return decryptSecret(data.secrets?.[provider]).trim();
}

function modelFor(profile, provider) {
  const selected = String(profile?.aiModel || "").trim();
  if (selected) return selected;
  return provider === "meta" ? DEFAULT_META_MODEL : DEFAULT_GEMINI_MODEL;
}

function compactMessages(snapshot) {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages.slice(-30) : [];
  if (messages.length) {
    return messages
      .map((item) => `${item.direction === "incoming" ? "Khách" : item.direction === "outgoing" ? "Page" : "Khác"}: ${String(item.text || "").trim()}`)
      .filter((line) => !line.endsWith(": "))
      .join("\n");
  }
  return Array.isArray(snapshot?.history)
    ? snapshot.history.slice(-30).join("\n")
    : String(snapshot?.latestText || "");
}

function parseJson(text, providerLabel) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${providerLabel} không trả về quyết định hội thoại hợp lệ.`);
  return JSON.parse(raw.slice(start, end + 1));
}

function systemPrompt(profile) {
  const knowledge = String(profile?.knowledge || "").slice(0, 16000);
  const custom = String(profile?.systemPrompt || "").slice(0, 5000);

  return [
    "Bạn là bộ điều phối hội thoại bán hàng của Page Facebook.",
    "Mục tiêu là quyết định đúng bước tiếp theo, không phải lúc nào cũng phải gửi tin.",
    "Luôn đọc toàn bộ lịch sử gần nhất trước khi quyết định.",
    "Không hỏi lại thông tin khách đã cung cấp. Không lặp lại cùng một ý hoặc cùng một câu mà Page vừa gửi.",
    "Nếu khách gửi nhiều tin liên tiếp, coi đó là một cụm ý và chỉ trả lời một lần sau khi khách nói xong.",
    "Mỗi câu trả lời phải hoàn chỉnh, tự nhiên, thường 1-3 câu; không bỏ dở câu giữa chừng.",
    "Không bịa giá, sản phẩm, ưu đãi, bảo hành, tồn kho, chính sách hoặc dữ liệu mà Page chưa cung cấp.",
    "Nếu Page vừa hỏi khách và khách chưa trả lời thì phải WAIT, tuyệt đối không tự nhắn tiếp.",
    "Nếu khách yêu cầu người thật, bực tức rõ ràng, vấn đề nhạy cảm hoặc dữ liệu không đủ để trả lời an toàn thì HANDOFF.",
    "Nếu khách đã từ chối, hết nhu cầu hoặc đơn đã xác nhận xong thì CLOSE.",
    "Nếu khách đang chờ Page trả lời và đủ dữ liệu thì REPLY.",
    "Follow-up hội thoại cũ phải ngắn, chỉ khi khách là người nhắn cuối và còn cơ hội bán hàng.",
    "Khi mục tiêu là xin SĐT/Zalo hoặc chốt đơn, làm tự nhiên theo tiến trình hội thoại, không ép khách và không xin lại nếu đã có.",
    custom ? `CHỈ DẪN RIÊNG CỦA PROFILE:\n${custom}` : "",
    knowledge ? `DỮ LIỆU RIÊNG CỦA PAGE:\n${knowledge}` : "DỮ LIỆU RIÊNG CỦA PAGE: (chưa có)"
  ].filter(Boolean).join("\n\n");
}

function userPrompt(snapshot, mode) {
  const transcript = compactMessages(snapshot);
  return `Chế độ: ${mode === "followup_old" ? "đánh giá follow-up hội thoại cũ" : "xử lý cụm tin mới"}
Hội thoại: ${snapshot?.title || "Không rõ"}

LỊCH SỬ GẦN NHẤT:
${transcript}

Hãy quyết định đúng MỘT hành động và trả về JSON duy nhất theo schema sau:
{
  "action":"reply|wait|follow_up|handoff|close",
  "status":"new|consulting|need_phone|need_name|need_address|need_order_details|need_confirmation|contact_promised|order_confirmed|done",
  "confidence":0.85,
  "customerWaitingForUs":true,
  "pageWaitingForCustomer":false,
  "explicitHumanRequest":false,
  "hasPhone":false,
  "hasZalo":false,
  "hasName":false,
  "hasAddress":false,
  "hasOrderIntent":true,
  "hasOrderDetails":false,
  "orderConfirmed":false,
  "missingFields":["phone"],
  "summary":"tóm tắt ngắn",
  "nextAction":"bước tiếp theo",
  "handoffReason":"",
  "shouldFollowUp":true,
  "reply":"nội dung duy nhất cần gửi cho khách, hoặc chuỗi rỗng nếu không nên gửi"
}

Quy tắc cuối:
- Nếu tin cuối là của Page và khách chưa trả lời: action=wait, reply="".
- Nếu action=reply/follow_up: reply phải là MỘT phản hồi hoàn chỉnh, không lặp tin Page gần nhất.
- Nếu đã có SĐT/Zalo thì không xin lại.
- Nếu đã biết diện tích/sản phẩm/nhu cầu thì không hỏi lại thông tin đó.
- Chỉ confidence >= 0.72 khi thật sự đủ chắc chắn để app tự gửi.
- Không thêm markdown, giải thích hay văn bản ngoài JSON.`;
}

async function callMeta(apiKey, model, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.1,
        reasoning_effort: "low",
        max_tokens: 1400,
        response_format: { type: "json_object" }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || "request failed";
      throw new Error(`Meta Model API HTTP ${response.status}: ${message}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part) => part?.text || part?.content || "").join("").trim()
        : "";
    if (!text) throw new Error("Meta Model API không trả về nội dung.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(apiKey, model, system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1800,
          responseMimeType: "application/json"
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || "request failed";
      throw new Error(`Gemini HTTP ${response.status}: ${message}`);
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini không trả về nội dung.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle("sales:analyze-followup", async (_event, profileId, snapshot, mode = "new_message") => {
  const profile = getProfile(profileId);
  if (!profile) throw new Error("Profile không tồn tại.");

  const provider = providerFor(profile);
  const providerLabel = provider === "meta" ? "Meta Model API" : "Gemini";
  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    throw new Error(`Chưa có ${providerLabel} key. Vào AI Cấu hình → chọn ${providerLabel} → lưu API key.`);
  }

  const safeMode = mode === "followup_old" ? "followup_old" : "new_message";
  const system = systemPrompt(profile);
  const user = userPrompt(snapshot || {}, safeMode);
  const model = modelFor(profile, provider);
  const raw = provider === "meta"
    ? await callMeta(apiKey, model, system, user)
    : await callGemini(apiKey, model, system, user);

  return normalizeSalesState(parseJson(raw, providerLabel));
});
