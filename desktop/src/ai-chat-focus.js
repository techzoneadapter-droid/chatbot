(() => {
  const q = (selector) => document.querySelector(selector);

  function setStatus(text, type = "muted") {
    const box = q("#ai-chat-focus-status");
    if (!box) return;
    box.textContent = text;
    box.className = `ai-chat-focus-status ${type}`;
  }

  function cleanError(error) {
    if (typeof errorText === "function") return errorText(error);
    return error?.message || String(error || "Lỗi AI không xác định");
  }

  function modePrompt(mode) {
    if (mode === "shorter") return "\n[PAGEBOT_ONE_SHOT]\nPhản hồi lần này ngắn hơn, tối đa 2 câu nếu vẫn đủ ý.\n[/PAGEBOT_ONE_SHOT]";
    if (mode === "friendly") return "\n[PAGEBOT_ONE_SHOT]\nPhản hồi lần này thân thiện, tự nhiên như nhân viên thật và tránh văn phong máy móc.\n[/PAGEBOT_ONE_SHOT]";
    if (mode === "sales") return "\n[PAGEBOT_ONE_SHOT]\nNếu đã đủ dữ liệu, khéo léo hướng khách tới bước tiếp theo nhưng không gây áp lực và không bịa ưu đãi.\n[/PAGEBOT_ONE_SHOT]";
    return "";
  }

  function isRecoverableModelError(error) {
    return /model|404|429|503|quá tải|giới hạn|unavailable|not found|không có quyền/i.test(cleanError(error));
  }

  async function chooseWorkingModel() {
    const provider = q("#ai-provider")?.value || "gemini";
    const result = await window.pagebot.ai.models(provider);
    const models = Array.isArray(result?.models) ? result.models : [];
    if (!models.length) throw new Error("API không trả về model chat khả dụng.");
    const current = q("#ai-model")?.value?.trim();
    const selected = current && models.includes(current) ? current : result.recommended || models[0];
    q("#ai-model").value = selected;
    return selected;
  }

  async function savePrompt(prompt) {
    if (!state?.activeProfile) return;
    state.activeProfile = await window.pagebot.profiles.update(state.activeProfile.id, {
      aiProvider: q("#ai-provider")?.value || "gemini",
      aiModel: q("#ai-model")?.value?.trim() || state.activeProfile.aiModel,
      knowledge: q("#knowledge")?.value || "",
      systemPrompt: prompt,
      autoReply: Boolean(q("#auto-reply")?.checked)
    });
  }

  async function suggest(mode = "normal") {
    if (!state?.activeProfile) return;
    const profileId = state.activeProfile.id;
    const basePrompt = q("#system-prompt")?.value || "";
    const temporaryPrompt = `${basePrompt}${modePrompt(mode)}`.trim();
    const button = q("#suggest-reply");
    if (button) button.disabled = true;

    try {
      setStatus("Đang đọc hội thoại...", "working");
      const snapshot = await window.pagebot.chat.snapshot();
      if (!snapshot?.inputFound) throw new Error("Không tìm thấy ô chat. Hãy mở một cuộc hội thoại trong Business Suite Inbox hoặc Messenger.");
      if (!snapshot?.latestText) throw new Error("Chưa đọc được tin nhắn trong hội thoại đang mở.");
      setStatus(`Đã đọc hội thoại · độ tin cậy ${Math.round((snapshot.confidence || 0) * 100)}%`, snapshot.incoming ? "ok" : "warn");

      await savePrompt(temporaryPrompt);
      let result;
      try {
        result = await window.pagebot.ai.suggest();
      } catch (error) {
        if (!isRecoverableModelError(error)) throw error;
        setStatus("Model hiện tại lỗi hoặc quá tải. Đang tự chọn model khả dụng...", "working");
        const selected = await chooseWorkingModel();
        await savePrompt(temporaryPrompt);
        if (typeof log === "function") log(`Đã tự chuyển sang model ${selected} để thử lại.`, "warn");
        result = await window.pagebot.ai.suggest();
      }

      if (state.activeProfile?.id !== profileId || result?.profileId !== profileId) return;
      state.lastSuggestion = result.text || "";
      q("#reply-output").value = state.lastSuggestion;
      q("#send-reply").disabled = !state.lastSuggestion;
      if (typeof renderDiagnostics === "function") renderDiagnostics(result.snapshot);
      setStatus("AI đã soạn xong. Hãy đọc, chỉnh nếu cần rồi mới bấm Gửi vào Facebook.", "ok");
      if (typeof log === "function") log("AI đã đọc hội thoại và soạn câu trả lời.", "success");
    } catch (error) {
      const text = cleanError(error);
      setStatus(text, "error");
      if (typeof log === "function") log(text, "error");
    } finally {
      try { await savePrompt(basePrompt); } catch {}
      if (button && state?.activeProfile) button.disabled = false;
    }
  }

  function installUi() {
    const suggestButton = q("#suggest-reply");
    if (!suggestButton || q("#ai-chat-focus-tools")) return;
    const tools = document.createElement("div");
    tools.id = "ai-chat-focus-tools";
    tools.className = "ai-chat-focus-tools";
    tools.innerHTML = `
      <div class="ai-chat-focus-title">AI Chat thủ công</div>
      <div id="ai-chat-focus-status" class="ai-chat-focus-status muted">Mở một cuộc chat rồi bấm AI soạn câu trả lời.</div>
      <div class="ai-chat-focus-modes">
        <button type="button" data-mode="shorter">Ngắn hơn</button>
        <button type="button" data-mode="friendly">Thân thiện hơn</button>
        <button type="button" data-mode="sales">Hướng chốt sale</button>
      </div>
    `;
    suggestButton.parentNode.insertBefore(tools, suggestButton);
    tools.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => void suggest(button.dataset.mode)));
  }

  function injectStyles() {
    if (q("#ai-chat-focus-style")) return;
    const style = document.createElement("style");
    style.id = "ai-chat-focus-style";
    style.textContent = `
      .ai-chat-focus-tools{margin:10px 0;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#fbfdff}
      .ai-chat-focus-title{font-size:11px;font-weight:800;color:#263248}
      .ai-chat-focus-status{margin-top:7px;padding:8px 9px;border-radius:8px;font-size:10px;line-height:1.45;background:#f4f7fa;color:#667085;border:1px solid #e2e8f0}
      .ai-chat-focus-status.ok{background:#f0faf5;color:#16764b;border-color:#bae4ce}.ai-chat-focus-status.warn{background:#fff9ec;color:#8b681a;border-color:#ead7a6}.ai-chat-focus-status.error{background:#fff4f5;color:#b73240;border-color:#f0bec4}.ai-chat-focus-status.working{background:#f3f7ff;color:#3564a8;border-color:#cbdaf2}
      .ai-chat-focus-modes{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.ai-chat-focus-modes button{border:1px solid #dbe2ea;background:#fff;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:700;color:#536075;cursor:pointer}.ai-chat-focus-modes button:hover{background:#f3f6fa}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    installUi();
    q("#suggest-reply")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      void suggest("normal");
    }, true);
  });
})();
