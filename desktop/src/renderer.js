const state = {
  profiles: [],
  activeProfile: null,
  lastSuggestion: "",
  secretStatus: { gemini: false, meta: false, encryptionAvailable: false }
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  bindStaticEvents();
  window.pagebot.onEvent(handleMainEvent);
  await Promise.all([loadProfiles(), loadSecretStatus()]);
  renderProfiles();
  renderAiPanel();
  if (state.profiles.length) await openProfile(state.profiles[0].id);
}

function bindStaticEvents() {
  $("#new-profile").addEventListener("click", () => $("#profile-dialog").showModal());
  $("#cancel-profile").addEventListener("click", () => $("#profile-dialog").close());
  $("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const profile = await window.pagebot.profiles.create({
      name: form.get("name"),
      startUrl: form.get("startUrl")
    });
    $("#profile-dialog").close();
    event.currentTarget.reset();
    await loadProfiles();
    renderProfiles();
    await openProfile(profile.id);
  });

  $("#back").addEventListener("click", () => window.pagebot.browser.back());
  $("#forward").addEventListener("click", () => window.pagebot.browser.forward());
  $("#reload").addEventListener("click", () => window.pagebot.browser.reload());
  $("#home").addEventListener("click", () => window.pagebot.browser.home());
  $("#url-form").addEventListener("submit", (event) => {
    event.preventDefault();
    window.pagebot.browser.navigate($("#url").value);
  });

  $("#save-profile").addEventListener("click", saveActiveProfile);
  $("#delete-profile").addEventListener("click", deleteActiveProfile);
  $("#ai-provider").addEventListener("change", updateModelPlaceholder);
  $("#save-api-key").addEventListener("click", saveApiKey);
  $("#clear-api-key").addEventListener("click", clearApiKey);
  $("#suggest-reply").addEventListener("click", suggestReply);
  $("#send-reply").addEventListener("click", sendSuggestion);
  $("#inspect-chat").addEventListener("click", inspectChat);
  $("#auto-reply").addEventListener("change", async () => {
    if (!state.activeProfile) return;
    state.activeProfile = await window.pagebot.profiles.update(state.activeProfile.id, { autoReply: $("#auto-reply").checked });
    await loadProfiles();
    renderProfiles();
    renderAiPanel();
    log($("#auto-reply").checked ? "Auto Chat đã bật cho profile đang mở." : "Auto Chat đã tắt.", "success");
  });
}

async function loadProfiles() {
  state.profiles = await window.pagebot.profiles.list();
}

async function loadSecretStatus() {
  state.secretStatus = await window.pagebot.secrets.status();
}

function renderProfiles() {
  const container = $("#profiles");
  if (!state.profiles.length) {
    container.innerHTML = '<div class="empty">Chưa có profile. Bấm + Tạo profile để bắt đầu.</div>';
    return;
  }
  container.innerHTML = state.profiles.map((profile) => {
    const active = profile.id === state.activeProfile?.id ? " active" : "";
    const auto = profile.autoReply ? '<span class="profile-dot auto"></span>' : '<span class="profile-dot"></span>';
    return `<button class="profile-card${active}" data-id="${escapeHtml(profile.id)}">
      ${auto}
      <span class="profile-info">
        <strong>${escapeHtml(profile.name)}</strong>
        <small>${escapeHtml(profile.aiProvider === "meta" ? "Meta AI" : "Gemini")}</small>
      </span>
    </button>`;
  }).join("");

  container.querySelectorAll(".profile-card").forEach((button) => {
    button.addEventListener("click", () => openProfile(button.dataset.id));
  });
}

async function openProfile(profileId) {
  setBusy(true, "Đang mở profile...");
  try {
    state.activeProfile = await window.pagebot.profiles.open(profileId);
    state.lastSuggestion = "";
    renderProfiles();
    renderAiPanel();
    const browserState = await window.pagebot.browser.state();
    $("#url").value = browserState.url || state.activeProfile.startUrl || "";
    $("#active-profile-name").textContent = state.activeProfile.name;
    log(`Đã mở ${state.activeProfile.name}. Đăng nhập Facebook trong khung trình duyệt nếu cần.`, "success");
  } catch (error) {
    log(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

function renderAiPanel() {
  const profile = state.activeProfile;
  const disabled = !profile;
  for (const id of ["ai-provider", "ai-model", "knowledge", "system-prompt", "auto-reply", "save-profile", "delete-profile", "suggest-reply", "inspect-chat"]) {
    $("#" + id).disabled = disabled;
  }
  if (!profile) {
    $("#active-profile-name").textContent = "Chưa mở profile";
    $("#ai-provider").value = "gemini";
    $("#ai-model").value = "gemini-3.8-flash";
    $("#knowledge").value = "";
    $("#system-prompt").value = "";
    $("#auto-reply").checked = false;
    $("#reply-output").value = "";
    $("#send-reply").disabled = true;
    updateApiStatus();
    return;
  }
  $("#active-profile-name").textContent = profile.name;
  $("#ai-provider").value = profile.aiProvider || "gemini";
  $("#ai-model").value = profile.aiModel || "gemini-3.8-flash";
  $("#knowledge").value = profile.knowledge || "";
  $("#system-prompt").value = profile.systemPrompt || "";
  $("#auto-reply").checked = Boolean(profile.autoReply);
  $("#reply-output").value = state.lastSuggestion;
  $("#send-reply").disabled = !state.lastSuggestion;
  updateModelPlaceholder();
  updateApiStatus();
}

function updateModelPlaceholder() {
  const provider = $("#ai-provider").value;
  $("#ai-model").placeholder = provider === "meta" ? "Model ID từ Meta Model API" : "gemini-3.8-flash";
  $("#api-key").placeholder = provider === "meta" ? "MODEL_API_KEY" : "Gemini API key";
  updateApiStatus();
}

function updateApiStatus() {
  const provider = $("#ai-provider").value;
  const ok = Boolean(state.secretStatus?.[provider]);
  const badge = $("#api-status");
  badge.textContent = ok ? "API đã cấu hình" : "Chưa có API key";
  badge.className = `status-badge ${ok ? "ok" : "warn"}`;
}

async function saveActiveProfile() {
  if (!state.activeProfile) return;
  setBusy(true, "Đang lưu...");
  try {
    const provider = $("#ai-provider").value;
    const model = $("#ai-model").value.trim();
    if (!model) throw new Error("Hãy nhập Model ID.");
    state.activeProfile = await window.pagebot.profiles.update(state.activeProfile.id, {
      aiProvider: provider,
      aiModel: model,
      knowledge: $("#knowledge").value,
      systemPrompt: $("#system-prompt").value,
      autoReply: $("#auto-reply").checked
    });
    await loadProfiles();
    renderProfiles();
    renderAiPanel();
    log("Đã lưu cấu hình AI cho profile.", "success");
  } catch (error) {
    log(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function deleteActiveProfile() {
  if (!state.activeProfile) return;
  const name = state.activeProfile.name;
  if (!confirm(`Xóa profile “${name}”? Dữ liệu đăng nhập của profile này cũng sẽ bị xóa.`)) return;
  await window.pagebot.profiles.delete(state.activeProfile.id);
  state.activeProfile = null;
  state.lastSuggestion = "";
  await loadProfiles();
  renderProfiles();
  renderAiPanel();
  $("#url").value = "";
  log(`Đã xóa ${name}.`, "success");
  if (state.profiles.length) await openProfile(state.profiles[0].id);
}

async function saveApiKey() {
  const provider = $("#ai-provider").value;
  const key = $("#api-key").value.trim();
  if (!key) return log("Hãy nhập API key.", "warn");
  setBusy(true, "Đang lưu API key...");
  try {
    await window.pagebot.secrets.set(provider, key);
    $("#api-key").value = "";
    await loadSecretStatus();
    updateApiStatus();
    log(`Đã lưu ${provider === "meta" ? "Meta Model API" : "Gemini"} key bằng Windows secure storage.`, "success");
  } catch (error) {
    log(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function clearApiKey() {
  const provider = $("#ai-provider").value;
  if (!confirm("Xóa API key đã lưu cho provider này?")) return;
  await window.pagebot.secrets.clear(provider);
  await loadSecretStatus();
  updateApiStatus();
  log("Đã xóa API key.", "success");
}

async function suggestReply() {
  if (!state.activeProfile) return;
  await saveActiveProfile();
  setBusy(true, "AI đang soạn...");
  try {
    const result = await window.pagebot.ai.suggest();
    state.lastSuggestion = result.text || "";
    $("#reply-output").value = state.lastSuggestion;
    $("#send-reply").disabled = !state.lastSuggestion;
    log(`AI đã đọc hội thoại “${result.snapshot?.title || "đang mở"}” và soạn câu trả lời.`, "success");
  } catch (error) {
    log(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function sendSuggestion() {
  const text = $("#reply-output").value.trim();
  if (!text) return;
  setBusy(true, "Đang gửi...");
  try {
    const sent = await window.pagebot.chat.send(text);
    if (!sent) throw new Error("Không tìm thấy ô chat để gửi.");
    log("Đã gửi câu trả lời vào hội thoại đang mở.", "success");
    state.lastSuggestion = "";
    $("#reply-output").value = "";
    $("#send-reply").disabled = true;
  } catch (error) {
    log(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function inspectChat() {
  setBusy(true, "Đang đọc hội thoại...");
  try {
    const snapshot = await window.pagebot.chat.snapshot();
    if (!snapshot?.inputFound) throw new Error("Chưa tìm thấy ô nhập tin nhắn. Hãy mở một cuộc chat trong Facebook/Messenger.");
    log(`Đọc được: ${snapshot.latestText || "chưa có tin nhắn"} · ${snapshot.incoming ? "có vẻ là tin khách" : "có vẻ là tin đã gửi"}`, snapshot.latestText ? "success" : "warn");
  } catch (error) {
    log(error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

function handleMainEvent(event) {
  if (!event) return;
  if (event.type === "browser-state") {
    if (event.payload?.url) $("#url").value = event.payload.url;
    if (event.payload?.loading !== undefined) $("#browser-loading").classList.toggle("visible", Boolean(event.payload.loading));
  }
  if (event.type === "ai-reply" && event.payload?.text) {
    state.lastSuggestion = event.payload.text;
    $("#reply-output").value = event.payload.text;
    $("#send-reply").disabled = false;
  }
  if (event.type === "active-profile" && event.payload) {
    state.activeProfile = event.payload;
    renderProfiles();
    renderAiPanel();
  }
  if (event.type === "log") log(event.payload?.text || "", event.payload?.level || "info");
}

function log(text, level = "info") {
  if (!text) return;
  const container = $("#activity");
  const time = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const item = document.createElement("div");
  item.className = `log-item ${level}`;
  item.innerHTML = `<span>${escapeHtml(time)}</span><p>${escapeHtml(text)}</p>`;
  container.prepend(item);
  while (container.children.length > 40) container.lastElementChild.remove();
}

function setBusy(active, text = "") {
  $("#busy").classList.toggle("visible", active);
  $("#busy-text").textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => log(error.message || String(error), "error"));
});
