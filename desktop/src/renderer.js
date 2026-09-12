const state = {
  profiles: [],
  activeProfile: null,
  lastSuggestion: "",
  secretStatus: { gemini: false, meta: false, encryptionAvailable: false },
  browserSupportedChat: false,
  autoBusy: false
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

function errorText(error) {
  const text = error?.message || String(error || "Lỗi không xác định");
  return text.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "");
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
    setBusy(true, "Đang tạo profile...");
    try {
      const profile = await window.pagebot.profiles.create({
        name: form.get("name"),
        startUrl: form.get("startUrl")
      });
      $("#profile-dialog").close();
      event.currentTarget.reset();
      await loadProfiles();
      renderProfiles();
      await openProfile(profile.id);
    } catch (error) {
      log(errorText(error), "error");
    } finally {
      setBusy(false);
    }
  });

  $("#back").addEventListener("click", () => window.pagebot.browser.back());
  $("#forward").addEventListener("click", () => window.pagebot.browser.forward());
  $("#reload").addEventListener("click", () => window.pagebot.browser.reload());
  $("#home").addEventListener("click", () => window.pagebot.browser.home());
  $("#cookie-tool").addEventListener("click", async () => {
    if (!state.activeProfile) return;
    try {
      await window.pagebot.cookieTool.open(state.activeProfile.id);
    } catch (error) {
      log(errorText(error), "error");
    }
  });
  $("#url-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await window.pagebot.browser.navigate($("#url").value);
    } catch (error) {
      log(errorText(error), "error");
    }
  });

  $("#save-profile").addEventListener("click", () => saveActiveProfile());
  $("#delete-profile").addEventListener("click", deleteActiveProfile);
  $("#ai-provider").addEventListener("change", updateModelPlaceholder);
  $("#save-api-key").addEventListener("click", saveApiKey);
  $("#test-ai").addEventListener("click", testAi);
  $("#clear-api-key").addEventListener("click", clearApiKey);
  $("#suggest-reply").addEventListener("click", suggestReply);
  $("#send-reply").addEventListener("click", sendSuggestion);
  $("#inspect-chat").addEventListener("click", inspectChat);
  $("#auto-reply").addEventListener("change", toggleAutoReply);
}

async function toggleAutoReply() {
  if (!state.activeProfile) return;
  const checked = $("#auto-reply").checked;
  if (checked && !state.browserSupportedChat) {
    $("#auto-reply").checked = false;
    log("Hãy mở Business Suite Inbox hoặc Messenger trước khi bật Auto Chat.", "warn");
    return;
  }
  try {
    state.activeProfile = await window.pagebot.profiles.update(state.activeProfile.id, { autoReply: checked });
    await loadProfiles();
    renderProfiles();
    renderAiPanel();
    log(checked ? "Auto Chat đã bật. Hội thoại hiện tại sẽ được lấy làm mốc, không trả lời lại tin cũ." : "Auto Chat đã tắt.", "success");
  } catch (error) {
    $("#auto-reply").checked = !checked;
    log(errorText(error), "error");
  }
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
        <small>${escapeHtml(profile.aiProvider === "meta" ? "Meta AI" : "Gemini")}${profile.autoReply ? " · Auto" : ""}</small>
      </span>
    </button>`;
  }).join("");

  container.querySelectorAll(".profile-card").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.id && button.dataset.id !== state.activeProfile?.id) void openProfile(button.dataset.id);
    });
  });
}

async function openProfile(profileId) {
  setBusy(true, "Đang mở profile...");
  try {
    const opened = await window.pagebot.profiles.open(profileId);
    if (!opened) throw new Error("Không mở được profile.");
    state.activeProfile = opened;
    state.lastSuggestion = "";
    state.autoBusy = false;
    renderProfiles();
    renderAiPanel();
    const browserState = await window.pagebot.browser.state();
    state.browserSupportedChat = Boolean(browserState.supportedChat);
    $("#url").value = browserState.url || state.activeProfile.lastUrl || state.activeProfile.startUrl || "";
    $("#active-profile-name").textContent = state.activeProfile.name;
    resetDiagnostics();
    log(`Đã mở ${state.activeProfile.name}. Phiên đăng nhập Facebook của profile này được lưu riêng.`, "success");
  } catch (error) {
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
}

function renderAiPanel() {
  const profile = state.activeProfile;
  const disabled = !profile;
  for (const id of ["ai-provider", "ai-model", "knowledge", "system-prompt", "auto-reply", "save-profile", "delete-profile", "suggest-reply", "inspect-chat", "test-ai", "cookie-tool"]) {
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
    resetDiagnostics();
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

async function saveActiveProfile(options = {}) {
  if (!state.activeProfile) return false;
  const showBusy = options.showBusy !== false;
  if (showBusy) setBusy(true, "Đang lưu...");
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
    if (!options.quiet) log("Đã lưu cấu hình AI cho profile.", "success");
    return true;
  } catch (error) {
    log(errorText(error), "error");
    return false;
  } finally {
    if (showBusy) setBusy(false);
  }
}

async function deleteActiveProfile() {
  if (!state.activeProfile) return;
  const name = state.activeProfile.name;
  if (!confirm(`Xóa profile “${name}”? Dữ liệu đăng nhập của profile này cũng sẽ bị xóa.`)) return;
  setBusy(true, "Đang xóa profile...");
  try {
    await window.pagebot.profiles.delete(state.activeProfile.id);
    state.activeProfile = null;
    state.lastSuggestion = "";
    state.browserSupportedChat = false;
    await loadProfiles();
    renderProfiles();
    renderAiPanel();
    $("#url").value = "";
    log(`Đã xóa ${name}.`, "success");
    if (state.profiles.length) await openProfile(state.profiles[0].id);
  } catch (error) {
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
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
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
}

async function testAi() {
  if (!state.activeProfile) return;
  const saved = await saveActiveProfile({ showBusy: false, quiet: true });
  if (!saved) return;
  const profileId = state.activeProfile.id;
  setBusy(true, "Đang kiểm tra AI...");
  try {
    const result = await window.pagebot.ai.test();
    if (state.activeProfile?.id !== profileId || result.profileId !== profileId) return;
    log(`${result.provider === "meta" ? "Meta Model API" : "Gemini"} hoạt động · ${result.model} · ${result.latencyMs}ms.`, "success");
  } catch (error) {
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
}

async function clearApiKey() {
  const provider = $("#ai-provider").value;
  if (!confirm("Xóa API key đã lưu cho provider này?")) return;
  try {
    await window.pagebot.secrets.clear(provider);
    await loadSecretStatus();
    updateApiStatus();
    log("Đã xóa API key.", "success");
  } catch (error) {
    log(errorText(error), "error");
  }
}

async function suggestReply() {
  if (!state.activeProfile) return;
  const saved = await saveActiveProfile({ showBusy: false, quiet: true });
  if (!saved) return;
  const profileId = state.activeProfile.id;
  setBusy(true, "AI đang soạn...");
  try {
    const result = await window.pagebot.ai.suggest();
    if (state.activeProfile?.id !== profileId || result.profileId !== profileId) {
      log("Đã đổi profile trong lúc AI soạn nên kết quả cũ được bỏ qua.", "warn");
      return;
    }
    state.lastSuggestion = result.text || "";
    $("#reply-output").value = state.lastSuggestion;
    $("#send-reply").disabled = !state.lastSuggestion;
    renderDiagnostics(result.snapshot);
    log(`AI đã đọc hội thoại “${result.snapshot?.title || "đang mở"}” và soạn câu trả lời.`, "success");
  } catch (error) {
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
}

async function sendSuggestion() {
  const text = $("#reply-output").value.trim();
  if (!text || !state.activeProfile) return;
  const profileId = state.activeProfile.id;
  setBusy(true, "Đang gửi...");
  try {
    const result = await window.pagebot.chat.send(text);
    if (result.profileId !== profileId || state.activeProfile?.id !== profileId) throw new Error("Đã đổi profile nên thao tác gửi bị hủy.");
    if (!result.ok) throw new Error(result.reason === "UNSUPPORTED_CHAT_URL" ? "Trang hiện tại không phải Business Suite Inbox/Messenger." : "Không tìm thấy ô chat hoặc nút gửi phù hợp.");
    log(result.verified ? "Đã gửi và xác nhận tin nhắn xuất hiện trong hội thoại." : "Đã thực hiện thao tác gửi nhưng chưa xác nhận được bong bóng tin mới. Hãy nhìn màn hình kiểm tra.", result.verified ? "success" : "warn");
    state.lastSuggestion = "";
    $("#send-reply").disabled = true;
  } catch (error) {
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
}

async function inspectChat() {
  setBusy(true, "Đang đọc hội thoại...");
  try {
    const snapshot = await window.pagebot.chat.snapshot();
    renderDiagnostics(snapshot);
    if (!snapshot?.supportedChat) throw new Error("Trang hiện tại không phải Business Suite Inbox hoặc Messenger.");
    if (!snapshot?.inputFound) throw new Error("Chưa tìm thấy ô nhập tin nhắn. Hãy mở một cuộc chat.");
    const confidence = Math.round((snapshot.confidence || 0) * 100);
    log(`Đọc được ${snapshot.messageCount || 0} dòng · tin cuối: ${snapshot.incoming ? "KHÁCH" : snapshot.latestDirection === "outgoing" ? "BẠN/PAGE" : "CHƯA RÕ"} · độ tin cậy ${confidence}%.`, snapshot.latestText ? "success" : "warn");
  } catch (error) {
    log(errorText(error), "error");
  } finally {
    setBusy(false);
  }
}

function resetDiagnostics() {
  const box = $("#chat-diagnostics");
  if (!box) return;
  box.className = "diagnostics muted";
  box.textContent = "Chưa kiểm tra hội thoại.";
}

function renderDiagnostics(snapshot) {
  const box = $("#chat-diagnostics");
  if (!box) return;
  if (!snapshot) {
    resetDiagnostics();
    return;
  }
  const confidence = Math.round((snapshot.confidence || 0) * 100);
  const direction = snapshot.incoming ? "Khách" : snapshot.latestDirection === "outgoing" ? "Bạn/Page" : "Chưa rõ";
  const latest = String(snapshot.latestText || "").slice(0, 150);
  box.className = `diagnostics ${snapshot.supportedChat && snapshot.inputFound ? "ok" : "warn"}`;
  box.innerHTML = [
    `<div><b>Trang:</b> ${snapshot.supportedChat ? "Chat hỗ trợ" : "Không phải trang chat"}</div>`,
    `<div><b>Ô nhập:</b> ${snapshot.inputFound ? "Có" : "Không"} · <b>Độ tin cậy:</b> ${confidence}%</div>`,
    `<div><b>Tin cuối:</b> ${escapeHtml(direction)}${latest ? ` · ${escapeHtml(latest)}` : ""}</div>`,
    `<div><b>Hội thoại:</b> ${escapeHtml(snapshot.title || snapshot.conversationKey || "Chưa rõ")}</div>`
  ].join("");
}

function handleMainEvent(event) {
  if (!event) return;
  if (event.type === "browser-state") {
    if (event.payload?.url) $("#url").value = event.payload.url;
    if (event.payload?.supportedChat !== undefined) {
      state.browserSupportedChat = Boolean(event.payload.supportedChat);
      if (!state.browserSupportedChat) resetDiagnostics();
    }
    if (event.payload?.loading !== undefined) $("#browser-loading").classList.toggle("visible", Boolean(event.payload.loading));
  }
  if (event.type === "auto-state") {
    state.autoBusy = Boolean(event.payload?.busy);
  }
  if (event.type === "ai-reply" && event.payload?.text) {
    if (event.payload.profileId && event.payload.profileId !== state.activeProfile?.id) return;
    $("#reply-output").value = event.payload.text;
    if (event.payload.automatic) {
      state.lastSuggestion = "";
      $("#send-reply").disabled = true;
    } else {
      state.lastSuggestion = event.payload.text;
      $("#send-reply").disabled = false;
    }
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
  while (container.children.length > 50) container.lastElementChild.remove();
}

function setBusy(active, text = "") {
  $("#busy").classList.toggle("visible", active);
  $("#busy-text").textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => log(errorText(error), "error"));
});
