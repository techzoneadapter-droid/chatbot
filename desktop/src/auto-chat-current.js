(() => {
  let activationId = 0;

  function cleanError(error) {
    const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error || "Lỗi Auto Chat"));
    return text.replace(/^Error:\s*/i, "");
  }

  function sameConversation(before, after) {
    if (!before || !after) return false;
    const beforeKey = before.conversationKey || before.url || "";
    const afterKey = after.conversationKey || after.url || "";
    if (beforeKey && afterKey && beforeKey !== afterKey) return false;
    if (String(before.latestText || "").trim() !== String(after.latestText || "").trim()) return false;
    if (String(before.latestDirection || "") !== String(after.latestDirection || "")) return false;
    return true;
  }

  async function recoverModelAndSuggest() {
    try {
      return await window.pagebot.ai.suggest();
    } catch (error) {
      const text = cleanError(error);
      if (!/(model|404|503|overload|high demand|unavailable|not found)/i.test(text)) throw error;
      if (typeof state === "undefined" || !state.activeProfile) throw error;

      const provider = document.getElementById("ai-provider")?.value || state.activeProfile.aiProvider || "gemini";
      const available = await window.pagebot.ai.models(provider);
      const models = Array.isArray(available?.models) ? available.models : [];
      const model = available?.recommended || models[0];
      if (!model) throw error;

      state.activeProfile = await window.pagebot.profiles.update(state.activeProfile.id, { aiModel: model });
      const modelInput = document.getElementById("ai-model");
      if (modelInput) modelInput.value = model;
      if (typeof log === "function") log(`Auto Chat đổi sang model khả dụng: ${model}`, "warn");
      return window.pagebot.ai.suggest();
    }
  }

  async function answerCurrentMessage(id) {
    try {
      if (id !== activationId) return;
      const toggle = document.getElementById("auto-reply");
      if (!toggle?.checked) return;

      const snapshot = await window.pagebot.chat.snapshot();
      if (id !== activationId || !toggle.checked) return;
      if (!snapshot?.inputFound) {
        if (typeof log === "function") log("Auto Chat đã bật nhưng chưa tìm thấy ô nhập tin nhắn.", "warn");
        return;
      }
      if (!snapshot.latestText) {
        if (typeof log === "function") log("Auto Chat đã bật. Chưa có tin khách để trả lời, app sẽ chờ tin mới.", "success");
        return;
      }
      if (!snapshot.incoming) {
        if (typeof log === "function") log("Auto Chat đã bật. Tin cuối hiện không phải của khách nên app sẽ chờ tin khách mới.", "success");
        return;
      }
      if ((snapshot.confidence || 0) < 0.72) {
        if (typeof log === "function") log(`Đã bật Auto nhưng độ tin cậy đọc hội thoại chỉ ${Math.round((snapshot.confidence || 0) * 100)}%. Chưa tự gửi để tránh nhầm.`, "warn");
        return;
      }

      if (typeof log === "function") log(`Auto Chat đang trả lời tin hiện tại: ${String(snapshot.latestText).slice(0, 120)}`, "info");
      const result = await recoverModelAndSuggest();
      if (id !== activationId || !toggle.checked) return;

      const latest = await window.pagebot.chat.snapshot();
      if (!sameConversation(result?.snapshot || snapshot, latest)) {
        if (typeof log === "function") log("Khách vừa nhắn thêm hoặc đã đổi hội thoại trong lúc AI soạn. Bỏ câu trả lời cũ.", "warn");
        return;
      }

      const text = String(result?.text || "").trim();
      if (!text) throw new Error("AI không tạo được câu trả lời.");

      const output = document.getElementById("reply-output");
      if (output) output.value = text;
      if (typeof state !== "undefined") state.lastSuggestion = text;

      const sent = await window.pagebot.chat.send(text);
      if (!sent?.ok) throw new Error(sent?.reason || "Không gửi được tin nhắn vào Facebook.");
      if (typeof log === "function") {
        log(sent.verified ? "Auto Chat đã trả lời tin khách đang mở." : "Auto Chat đã gửi thao tác nhưng chưa xác nhận được bong bóng tin nhắn mới.", sent.verified ? "success" : "warn");
      }
    } catch (error) {
      if (typeof log === "function") log(`Auto Chat: ${cleanError(error)}`, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("auto-reply");
    if (!toggle) return;
    toggle.addEventListener("change", () => {
      activationId += 1;
      const id = activationId;
      if (!toggle.checked) return;
      setTimeout(() => void answerCurrentMessage(id), 450);
    });
  });
})();
