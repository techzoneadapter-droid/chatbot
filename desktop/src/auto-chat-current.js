(() => {
  const POLL_MS = 4200;
  const STABLE_MS = 420;
  let activationId = 0;
  let timer = null;
  let busy = false;
  let lastHandledSignature = "";

  function cleanError(error) {
    const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error || "Lỗi Auto Chat"));
    return text.replace(/^Error:\s*/i, "");
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function snapshotSignature(snapshot) {
    if (!snapshot) return "";
    const conversation = snapshot.conversationKey || snapshot.url || "current-chat";
    const tail = Array.isArray(snapshot.messages)
      ? snapshot.messages.slice(-5).map((item) => `${item?.direction || "unknown"}:${String(item?.text || "").trim()}`).join("|")
      : `${snapshot.latestDirection || "unknown"}:${String(snapshot.latestText || "").trim()}`;
    return `${conversation}|${tail}`;
  }

  function sameCurrentMessage(before, after) {
    if (!before || !after) return false;
    const beforeKey = before.conversationKey || before.url || "";
    const afterKey = after.conversationKey || after.url || "";
    if (beforeKey && afterKey && beforeKey !== afterKey) return false;
    if (String(before.latestText || "").trim() !== String(after.latestText || "").trim()) return false;
    if (String(before.latestDirection || "") !== String(after.latestDirection || "")) return false;
    return true;
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule(id, delay = POLL_MS) {
    clearTimer();
    const toggle = document.getElementById("auto-reply");
    if (id !== activationId || !toggle?.checked) return;
    timer = setTimeout(() => void tick(id), delay);
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

  async function tick(id) {
    const toggle = document.getElementById("auto-reply");
    if (id !== activationId || !toggle?.checked) return;
    if (busy) return schedule(id, 900);

    busy = true;
    try {
      const first = await window.pagebot.chat.snapshot();
      if (id !== activationId || !toggle.checked) return;
      if (!first?.supportedChat || !first?.inputFound || !first.latestText) return;
      if (!first.incoming) return;
      if ((first.confidence || 0) < 0.68) {
        if (typeof log === "function") log(`Auto Chat thấy tin mới nhưng độ tin cậy đọc hội thoại chỉ ${Math.round((first.confidence || 0) * 100)}%.`, "warn");
        return;
      }

      const signature = snapshotSignature(first);
      if (!signature || signature === lastHandledSignature) return;

      await wait(STABLE_MS);
      const stable = await window.pagebot.chat.snapshot();
      if (id !== activationId || !toggle.checked) return;
      if (!sameCurrentMessage(first, stable) || !stable?.incoming) return;

      if (typeof log === "function") log(`Auto Chat nhận tin khách: ${String(stable.latestText).slice(0, 120)}`, "info");
      const result = await recoverModelAndSuggest();
      if (id !== activationId || !toggle.checked) return;

      const latest = await window.pagebot.chat.snapshot();
      if (!sameCurrentMessage(result?.snapshot || stable, latest)) {
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

      // Mark handled even when visual verification is inconclusive, otherwise a
      // slow Facebook repaint could make the same customer message send twice.
      lastHandledSignature = signature;
      if (typeof log === "function") {
        log(
          sent.verified ? "Auto Chat đã trả lời tin khách." : "Auto Chat đã gửi câu trả lời; Facebook chưa kịp xác nhận bong bóng tin mới.",
          sent.verified ? "success" : "warn"
        );
      }
    } catch (error) {
      if (typeof log === "function") log(`Auto Chat: ${cleanError(error)}`, "error");
    } finally {
      busy = false;
      schedule(id);
    }
  }

  function activate() {
    activationId += 1;
    const id = activationId;
    lastHandledSignature = "";
    clearTimer();
    const toggle = document.getElementById("auto-reply");
    if (!toggle?.checked) {
      if (typeof log === "function") log("Auto Chat nền đã dừng hoàn toàn.", "success");
      return;
    }
    if (typeof log === "function") log("Auto Chat chạy nền nhẹ. App vẫn dùng bình thường; chỉ đọc chat khi đến lượt kiểm tra.", "success");
    schedule(id, 650);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("auto-reply");
    if (!toggle) return;
    toggle.addEventListener("change", activate);
  });
})();
