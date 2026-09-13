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
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages.slice(-30) : [];
  if (messages.length) {
    return messages
      .map((item) => `${item.direction === "incoming" ? "Khách" : "Page"}: ${String(item.text || "").trim()}`)
      .filter((line) => !line.endsWith(": "))
      .join("\n");
  }
  return Array.isArray(snapshot?.history) ? snapshot.history.slice(-30).join("\n") : String(snapshot?.latestText || "");
}

function extractJson(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI không trả về quyết định hội thoại hợp lệ.");
  return JSON.parse(raw.slice(start, end + 1));
}

function promptFor(profile, snapshot, mode) {
  const transcript = compactMessages(snapshot);
  const knowledge = String(profile.knowledge || "").slice(0, 14000);
  const custom = String(profile.systemPrompt || "").slice(0, 4000);

  return `Bạn là AI Sales Orchestrator của Page Facebook. Nhiệm vụ không phải lúc nào cũng trả lời; nhiệm vụ là chọn đúng hành động tiếp theo cho MỘT hội thoại và tránh spam.

Hãy đọc toàn bộ đoạn hội thoại và trả JSON duy nhất, không markdown.

HÀNH ĐỘNG HỢP LỆ:
- reply: khách vừa nói xong và đang chờ Page trả lời.
- wait: Page đã hỏi/đã trả lời và hiện đang chờ khách; TUYỆT ĐỐI không gửi thêm.
- follow_up: hội thoại cũ bị bỏ dở, khách là người nhắn cuối, còn cơ hội bán hàng và hợp lý để nối lại.
- handoff: khách yêu cầu người thật, khách bực tức, vấn đề nhạy cảm, hoặc AI không đủ dữ liệu/độ tin cậy để trả lời an toàn.
- close: khách đã hoàn tất đơn/đã từ chối/không còn nhu cầu và không còn việc cần nhắn.

NGUYÊN TẮC CHỐNG SPAM:
1. Nếu tin cuối của Page là câu hỏi/yêu cầu thông tin và khách chưa trả lời thì action=wait.
2. Không gửi nhiều tin liên tiếp từ Page để thúc khách.
3. Nếu khách vừa gửi nhiều tin liên tiếp, coi chúng là một cụm ý và trả lời một lần sau khi khách nói xong.
4. Follow-up hội thoại cũ phải ngắn, tự nhiên, không nói 'hệ thống nhắc', không lặp câu Page vừa nói.
5. Nếu Page đã hứa sẽ gọi/kết bạn Zalo/liên hệ thì action=wait hoặc close; không hứa lại.
6. Nếu không chắc câu trả lời đúng, action=handoff thay vì bịa.

LOGIC BÁN HÀNG:
- Mục tiêu: hiểu nhu cầu -> tư vấn -> thu đủ thông tin -> tóm tắt -> xin khách xác nhận.
- Đơn chỉ đủ thông tin khi có sản phẩm/biến thể/số lượng cần thiết, tên người nhận, SĐT, địa chỉ.
- Nếu khách có nhu cầu nhưng thiếu thông tin, chỉ hỏi tối đa 1-2 mục quan trọng mỗi tin.
- Nếu khách gửi SĐT/Zalo mà chưa đủ đơn, xác nhận đã nhận và nói bên Page sẽ liên hệ/kết bạn sớm nhất CHỈ nếu Page chưa từng nói điều đó.
- Nếu đủ thông tin nhưng chưa xác nhận, status=need_confirmation; reply phải tóm tắt ngắn đơn và hỏi khách xác nhận.
- Chỉ status=order_confirmed khi khách đã xác nhận rõ ràng thông tin đơn.
- Khi order_confirmed, chỉ nói đã ghi nhận/xác nhận đơn. KHÔNG nói 'đã lên đơn trên hệ thống' vì app chưa có API tạo đơn.
- Nếu khách từ chối hoặc hết nhu cầu: status=done, action=close.

HANDOFF:
- explicitHumanRequest=true nếu khách muốn gặp nhân viên/người thật.
- handoff khi khách tức giận rõ ràng, khiếu nại nghiêm trọng, vấn đề pháp lý/tài chính nhạy cảm, hoặc bạn thiếu dữ liệu để trả lời chính xác.
- Khi handoff, reply có thể là một câu xác nhận ngắn để nhân viên tiếp nhận, nhưng app sẽ KHÔNG tự gửi câu đó; chỉ dùng để hiển thị/gợi ý.

ĐỘ TIN CẬY:
- confidence từ 0 đến 1.
- Chỉ >=0.72 mới đủ để tự gửi reply/follow_up.
- Nếu thấp hơn, action=handoff hoặc wait.

mode=${mode}
STATUS hợp lệ: new, consulting, need_phone, need_name, need_address, need_order_details, need_confirmation, contact_promised, order_confirmed, done.

JSON schema:
{"action":"reply|wait|follow_up|handoff|close","status":"...","confidence":0.85,"customerWaitingForUs":true,"pageWaitingForCustomer":false,"explicitHumanRequest":false,"hasPhone":false,"hasZalo":false,"hasName":false,"hasAddress":false,"hasOrderIntent":true,"hasOrderDetails":false,"orderConfirmed":false,"missingFields":["phone"],"summary":"...","nextAction":"...","handoffReason":"","shouldFollowUp":true,"reply":"..."}

DỮ LIỆU RIÊNG CỦA PAGE:
${knowledge || "(chưa có)"}
${custom ? `\nCHỈ DẪN RIÊNG:\n${custom}` : ""}

HỘI THOẠI ${snapshot?.title ? `VỚI ${snapshot.title}` : ""}:
${transcript}

Trả JSON duy nhất.`;
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
        generationConfig: { temperature: 0.15, maxOutputTokens: 950, responseMimeType: "application/json" }
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
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.15 })
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

  const safeMode = mode === "followup_old" ? "followup_old" : "new_message";
  const prompt = promptFor(profile, snapshot || {}, safeMode);
  const raw = provider === "meta" ? await callMeta(apiKey, model, prompt) : await callGemini(apiKey, model, prompt);
  return normalizeSalesState(extractJson(raw));
});
