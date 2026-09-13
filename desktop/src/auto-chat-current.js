(() => {
  const POLL_MS = 6500;
  const QUIET_MS = 950;
  const MAX_STABLE_PASSES = 3;
  const MAX_SCAN_PER_CYCLE = 3;
  let activationId = 0;
  let timer = null;
  let busy = false;
  let roundRobinCursor = 0;
  const conversationStates = new Map();
  const lastSentText = new Map();
  const processingKeys = new Set();

  if (!window.__pagebotChatbotEngine) window.__pagebotChatbotEngine = "light";

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
          .slice(-8)
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

  function candidateStateKey(candidate, snapshot) {
    return `${candidate?.key || "current"}::${conversationKey(snapshot)}`;
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
      if (typeof log === "function") log(`Đa luồng đổi sang model khả dụng: ${model}`, "warn");
      return window.pagebot.ai.suggest();
    }
  }

  async function openCandidate(candidate) {
    if (!candidate?.locator || !window.pagebot.chat.openConversation) return { ok: true };
    return window.pagebot.chat.openConversation(candidate.locator);
  }

  async function processCandidate(candidate, id) {
    if (!canRun(id)) return;
    const candidateKey = candidate?.key || "current-chat";
    if (processingKeys.has(candidateKey)) return;
    processingKeys.add(candidateKey);

    let stateKey = "";
    let signature = "";
    try {
      const opened = await openCandidate(candidate);
      if (!opened?.ok) return;
      if (!canRun(id)) return;

      const first = await window.pagebot.chat.snapshot();
      if (!first?.supportedChat || !first?.inputFound || !first.latestText || !first.incoming) return;
      if ((first.confidence || 0) < 0.68) return;

      stateKey = candidateStateKey(candidate, first);
      signature = incomingSignature(first);
      if (!signature) return;

      let convState = conversationStates.get(stateKey);
      if (!convState) {
        conversationStates.set(stateKey, {
          seenSignature: signature,
          handledSignature: "",
          title: first.title || candidate?.label || "",
          locator: candidate?.locator || null
        });
        return;
      }
      if (signature === convState.seenSignature || signature === convState.handledSignature) return;

      const stable = await waitForStableIncoming(first, id);
      if (!stable || !canRun(id)) return;
      const stableSignature = incomingSignature(stable);
      if (!stableSignature || stableSignature === convState.handledSignature) return;
      if (!sameConversation(first, stable)) return;

      convState.seenSignature = stableSignature;
      const customerName = stable.title || candidate?.label || "khách";
      if (typeof log === "function") log(`[${customerName}] Có tin mới: ${String(stable.latestText).slice(0, 120)}`, "info");

      const result = await recoverModelAndSuggest();
      if (!canRun(id)) return;
      const text = String(result?.text || "").trim();
      if (!text) throw new Error("AI không tạo được câu trả lời.");

      // Global send lane: DOM interaction is always serialized. Re-open the exact
      // candidate and re-read it before sending, so an AI result can never leak
      // into another customer's thread after Facebook reorders the inbox.
      const reopened = await openCandidate(candidate);
      if (!reopened?.ok || !canRun(id)) return;
      const latest = await window.pagebot.chat.snapshot();
      if (!latest?.incoming || !sameConversation(stable, latest)) {
        if (typeof log === "function") log(`[${customerName}] Hội thoại đã đổi trước lúc gửi. Hủy câu trả lời để tránh nhắn nhầm.`, "warn");
        return;
      }
      const latestSignature = incomingSignature(latest);
      if (latestSignature !== stableSignature) {
        if (typeof log === "function") log(`[${customerName}] Khách vừa nhắn thêm. Hủy bản cũ và chờ vòng mới.`, "warn");
        convState.seenSignature = latestSignature || convState.seenSignature;
        return;
      }
      const revalidatedKey = candidateStateKey(candidate, latest);
      if (revalidatedKey !== stateKey) {
        if (typeof log === "function") log(`[${customerName}] Thread key không còn trùng. Không gửi.`, "warn");
        return;
      }

      const recentOutgoing = Array.isArray(latest.messages)
        ? latest.messages.filter((item) => item?.direction === "outgoing").slice(-5).map((item) => item?.text)
        : [];
      if (recentOutgoing.some((item) => similarText(text, item)) || similarText(text, lastSentText.get(stateKey))) {
        convState.handledSignature = stableSignature;
        if (typeof log === "function") log(`[${customerName}] Đã chặn câu trả lời trùng.`, "warn");
        return;
      }

      const sent = await window.pagebot.chat.send(text);
      if (!sent?.ok) throw new Error(sent?.reason || "Không gửi được tin nhắn vào Facebook.");

      convState.handledSignature = stableSignature;
      lastSentText.set(stateKey, text);
      const output = document.getElementById("reply-output");
      if (output) output.value = text;
      if (typeof state !== "undefined") state.lastSuggestion = text;
      if (typeof log === "function") {
        log(
          `[${customerName}] ${sent.verified ? "Đã trả lời xong." : "Đã gửi; đang chờ Facebook xác nhận bong bóng."}`,
          sent.verified ? "success" : "warn"
        );
      }
    } catch (error) {
      const text = cleanError(error);
      if (/429|quota|rate limit|exceeded your current quota/i.test(text) && stateKey && signature) {
        const convState = conversationStates.get(stateKey);
        if (convState) convState.handledSignature = signature;
        if (typeof log === "function") log(`Đa luồng dừng retry thread này vì API đang hết quota/429.`, "error");
      } else if (typeof log === "function") {
        log(`Đa luồng: ${text}`, "error");
      }
    } finally {
      processingKeys.delete(candidateKey);
    }
  }

  function chooseBatch(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return [null];
    const total = candidates.length;
    const count = Math.min(MAX_SCAN_PER_CYCLE, total);
    const batch = [];
    for (let offset = 0; offset < count; offset += 1) {
      batch.push(candidates[(roundRobinCursor + offset) % total]);
    }
    roundRobinCursor = (roundRobinCursor + count) % total;
    return batch;
  }

  async function tick(id) {
    if (!canRun(id)) return;
    if (busy) return schedule(id, 1000);
    busy = true;
    try {
      let candidates = [];
      try {
        candidates = await window.pagebot.chat.listConversations();
      } catch {}
      if (!canRun(id)) return;

      const batch = chooseBatch(candidates);
      window.__pagebotMultiChatState = {
        visibleConversations: Array.isArray(candidates) ? candidates.length : 0,
        batchSize: batch.length,
        at: Date.now()
      };
      for (const candidate of batch) {
        if (!canRun(id)) break;
        await processCandidate(candidate, id);
      }
    } catch (error) {
      if (typeof log === "function") log(`Đa luồng: ${cleanError(error)}`, "error");
    } finally {
      busy = false;
      schedule(id);
    }
  }

  function activate() {
    activationId += 1;
    const id = activationId;
    clearTimer();
    processingKeys.clear();
    if (!canRun(id)) return;
    if (typeof log === "function") {
      log("Auto đa luồng đã bật. Mỗi khách có state riêng; thao tác gửi được khóa tuần tự để không trộn hội thoại.", "success");
    }
    schedule(id, 700);
  }

  window.addEventListener("pagebot:chatbot-engine-change", activate);

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("auto-reply");
    if (!toggle) return;
    toggle.addEventListener("change", activate);
  });
})();
