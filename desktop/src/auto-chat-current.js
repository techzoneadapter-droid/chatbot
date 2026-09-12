(() => {
  const POLL_MS = 6000;
  const QUIET_MS = 1100;
  const MAX_STABLE_PASSES = 3;
  let activationId = 0;
  let timer = null;
  let busy = false;
  const handledIncoming = new Map();
  const lastSentText = new Map();

  function lightEngineSelected() {
    return window.__pagebotChatbotEngine === "light";
  }

  function cleanError(error) {
    const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error || "Lỗi Auto Chat"));
    return text.replace(/^Error:\s*/i, "");
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
  }

  function conversationKey(snapshot) {
    return snapshot?.conversationKey || snapshot?.url || "current-chat";
  }

  function incomingSignature(snapshot) {
    if (!snapshot) return "";
    const incoming = Array.isArray(snapshot.messages)
      ? snapshot.messages
          .filter((item) => item?.direction === "incoming")
          .slice(-6)
          .map((item) => normalizeText(item?.text))
          .filter(Boolean)
      : [normalizeText(snapshot.latestText)].filter(Boolean);
    return `${conversationKey(snapshot)}|${incoming.join("||")}`;
  }

  function similarText(a, b) {
    const left = normalizeText(a);
    const right = normalizeText(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length > right.length ? left : right;
    return shorter.length >= 24 && longer.includes(shorter) && shorter.length / longer.length >= 0.82;
  }

  function sameConversation(before, after) {
    return Boolean(before && after && conversationKey(before) === conversationKey(after));
  }

  async function waitForStableIncoming(initial, id) {
    let current = initial;
    let previousSignature = incomingSignature(initial);
    for (let pass = 0; pass < MAX_STABLE_PASSES; pass += 1) {
      await wait(QUIET_MS);
      if (!canRun(id)) return null;
      const next = await window.pagebot.chat.snapshot();
      if (!next?.incoming || !sameConversation(current, next)) return null;
      const nextSignature = incomingSignature(next);
      if (nextSignature === previousSignature) return next;
      current = next;
      previousSignature = nextSignature;
    }
    return current;
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function canRun(id) {
    const toggle = document.getElementById("auto-reply");
    return id === activationId && Boolean(toggle?.checked) && lightEngineSelected();
  }

  function schedule(id, delay = POLL_MS) {
    clearTimer();
    if (!canRun(id)) return;
    timer = setTimeout(() => void tick(id), delay);
  }

  async function recoverModelAndSuggest() {
    try {
      return await window.pagebot.ai.suggest();
    } catch (error) {
      const text = cleanError(error);
      if (/429|quota|rate limit|exceeded your current quota/i.test(text)) throw error;
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
      if (typeof log === "function") log(`Auto nhẹ đổi sang model khả dụng: ${model}`, "warn");
      return window.pagebot.ai.suggest();
    }
  }

  async function tick(id) {
    if (!canRun(id)) return;
    if (busy) return schedule(id, 1000);

    let currentKey = "";
    let currentSignature = "";
    busy = true;
    try {
      const first = await window.pagebot.chat.snapshot();
      if (!canRun(id)) return;
      if (!first?.supportedChat || !first?.inputFound || !first.latestText || !first.incoming) return;
      if ((first.confidence || 0) < 0.68) {
        if (typeof log === "function") log(`Auto nhẹ thấy tin mới nhưng độ tin cậy đọc hội thoại chỉ ${Math.round((first.confidence || 0) * 100)}%.`, "warn");
        return;
      }

      const firstKey = conversationKey(first);
      const firstSignature = incomingSignature(first);
      if (!firstSignature || handledIncoming.get(firstKey) === firstSignature) return;

      const stable = await waitForStableIncoming(first, id);
      if (!stable || !canRun(id)) return;
      const key = conversationKey(stable);
      const signature = incomingSignature(stable);
      if (!signature || handledIncoming.get(key) === signature) return;
      currentKey = key;
      currentSignature = signature;

      if (typeof log === "function") log(`Auto nhẹ nhận tin khách: ${String(stable.latestText).slice(0, 120)}`, "info");
      const result = await recoverModelAndSuggest();
      if (!canRun(id)) return;

      const latest = await window.pagebot.chat.snapshot();
      if (!latest?.incoming || !sameConversation(stable, latest) || incomingSignature(latest) !== signature) {
        if (typeof log === "function") log("Khách vừa nhắn thêm hoặc đã đổi hội thoại trong lúc AI soạn. Bỏ câu trả lời cũ.", "warn");
        return;
      }

      const text = String(result?.text || "").trim();
      if (!text) throw new Error("AI không tạo được câu trả lời.");

      const recentOutgoing = Array.isArray(latest.messages)
        ? latest.messages.filter((item) => item?.direction === "outgoing").slice(-5).map((item) => item?.text)
        : [];
      if (recentOutgoing.some((item) => similarText(text, item)) || similarText(text, lastSentText.get(key))) {
        handledIncoming.set(key, signature);
        if (typeof log === "function") log("Auto nhẹ đã chặn một câu trả lời bị lặp với tin Page vừa gửi.", "warn");
        return;
      }

      const output = document.getElementById("reply-output");
      if (output) output.value = text;
      if (typeof state !== "undefined") state.lastSuggestion = text;

      const sent = await window.pagebot.chat.send(text);
      if (!sent?.ok) throw new Error(sent?.reason || "Không gửi được tin nhắn vào Facebook.");

      handledIncoming.set(key, signature);
      lastSentText.set(key, text);
      if (typeof log === "function") {
        log(
          sent.verified ? "Auto nhẹ đã trả lời tin khách." : "Auto nhẹ đã gửi câu trả lời; Facebook chưa kịp xác nhận bong bóng tin mới.",
          sent.verified ? "success" : "warn"
        );
      }
    } catch (error) {
      const text = cleanError(error);
      if (/429|quota|rate limit|exceeded your current quota/i.test(text) && currentKey && currentSignature) {
        handledIncoming.set(currentKey, currentSignature);
        if (typeof log === "function") log("Auto nhẹ dừng retry tin này vì API đang hết quota/429. Sẽ chỉ thử lại khi khách có tin mới.", "error");
      } else if (typeof log === "function") {
        log(`Auto nhẹ: ${text}`, "error");
      }
    } finally {
      busy = false;
      schedule(id);
    }
  }

  function activate() {
    activationId += 1;
    const id = activationId;
    clearTimer();
    if (!canRun(id)) return;
    if (typeof log === "function") log("Auto nhẹ đã bật. Tin khách gửi sát nhau sẽ được gom trước khi AI trả lời.", "success");
    schedule(id, 700);
  }

  window.addEventListener("pagebot:chatbot-engine-change", activate);

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("auto-reply");
    if (!toggle) return;
    toggle.addEventListener("change", activate);
  });
})();
