const { app, ipcMain, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

function dataFile() {
  return path.join(app.getPath("userData"), "pagebot-data.json");
}

function readData() {
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

function decryptSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}

function apiKey(provider) {
  const value = readData().secrets?.[provider];
  return decryptSecret(value).trim();
}

function friendlyError(error) {
  if (error?.name === "AbortError") return new Error("Kết nối AI quá thời gian. Hãy thử lại hoặc kiểm tra mạng/API.");
  const message = error instanceof Error ? error.message : String(error || "Lỗi AI không xác định");
  if (/429|rate limit|resource exhausted/i.test(message)) return new Error("AI đang giới hạn lưu lượng. Đợi một chút rồi thử lại.");
  if (/503|overload|high demand|unavailable/i.test(message)) return new Error("Model AI đang quá tải tạm thời. Hãy chọn model khác hoặc thử lại.");
  if (/401|403|api key|unauthorized|permission/i.test(message)) return new Error("API key không hợp lệ hoặc chưa có quyền dùng model này.");
  return new Error(message.slice(0, 700));
}

async function withTimeout(task, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    throw friendlyError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function listGeminiModels(key) {
  return withTimeout(async (signal) => {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": key },
      signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "không tải được danh sách model"}`);
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return models
      .filter((item) => Array.isArray(item?.supportedGenerationMethods) && item.supportedGenerationMethods.includes("generateContent"))
      .map((item) => String(item?.name || "").replace(/^models\//, "").trim())
      .filter(Boolean)
      .filter((name) => !/(embedding|aqa|imagen|image-generation|tts|live)/i.test(name));
  }, 12000);
}

async function listMetaModels(key) {
  return withTimeout(async (signal) => {
    const response = await fetch("https://api.meta.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Meta Model API HTTP ${response.status}: ${payload?.error?.message || payload?.message || "không tải được danh sách model"}`);
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
    return rows.map((item) => typeof item === "string" ? item : item?.id || item?.name).map((value) => String(value || "").trim()).filter(Boolean);
  }, 12000);
}

function recommendedModel(models) {
  if (!Array.isArray(models) || !models.length) return "";
  return models.find((name) => /flash/i.test(name) && !/(lite|preview|exp)/i.test(name))
    || models.find((name) => /flash/i.test(name))
    || models[0];
}

async function probeGemini(key, model) {
  return withTimeout(async (signal) => {
    const started = Date.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Trả lời đúng một câu ngắn: Kết nối AI thành công." }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 60 }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
    if (!text) throw new Error("Gemini không trả về nội dung.");
    return { ok: true, provider: "gemini", model, latencyMs: Date.now() - started, preview: text.slice(0, 180) };
  }, 35000);
}

async function probeMeta(key, model) {
  return withTimeout(async (signal) => {
    const started = Date.now();
    const response = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Trả lời đúng một câu ngắn: Kết nối AI thành công." }],
        temperature: 0.1
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Meta Model API HTTP ${response.status}: ${payload?.error?.message || payload?.message || "request failed"}`);
    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : Array.isArray(content) ? content.map((part) => part?.text || "").join("").trim() : "";
    if (!text) throw new Error("Meta Model API không trả về nội dung.");
    return { ok: true, provider: "meta", model, latencyMs: Date.now() - started, preview: text.slice(0, 180) };
  }, 35000);
}

function registerAiRuntimeIpc() {
  ipcMain.handle("ai:models", async (_event, provider) => {
    if (provider !== "gemini" && provider !== "meta") throw new Error("Provider AI không hợp lệ.");
    const key = apiKey(provider);
    if (!key) throw new Error(`${provider === "meta" ? "Meta Model API" : "Gemini"} chưa có API key.`);
    const models = provider === "meta" ? await listMetaModels(key) : await listGeminiModels(key);
    return { provider, models, recommended: recommendedModel(models) };
  });

  ipcMain.handle("ai:probe", async (_event, input = {}) => {
    const provider = input.provider === "meta" ? "meta" : "gemini";
    const model = String(input.model || "").trim();
    if (!model) throw new Error("Hãy chọn Model trước khi kiểm tra AI.");
    const key = apiKey(provider);
    if (!key) throw new Error(`${provider === "meta" ? "Meta Model API" : "Gemini"} chưa có API key.`);
    return provider === "meta" ? probeMeta(key, model) : probeGemini(key, model);
  });
}

module.exports = { registerAiRuntimeIpc };
