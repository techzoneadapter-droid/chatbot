(() => {
  const POLL_MS = 6500;
  const CUSTOMER_SETTLE_MS = 2200;
  const REQUIRED_STABLE_PASSES = 2;
  const MAX_STABLE_PASSES = 6;
  const MAX_SCAN_PER_CYCLE = 3;
  const FOLLOWUP_COOLDOWN_MS = 45 * 60 * 1000;
  const MAX_FOLLOWUPS_PER_DAY = 1;
  const DEFAULT_AI_COOLDOWN_MS = 60 * 1000;

  let activationId = 0;
  let timer = null;
  let busy = false;
  let roundRobinCursor = 0;
  let aiCooldownUntil = 0;
  let lastCooldownLogUntil = 0;

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

  function activeProfileId() {
    return typeof state !== "undefined" && state.activeProfile?.id ? state.activeProfile.id : null;
  }

  function salesComplete(plan) {
    if (!plan) return false;
    if (plan.status === "done" || plan.status === "order_confirmed") return true;
    return Boolean(plan.hasOrderIntent && plan.orderConfirmed && plan.hasPhone && plan.hasName && plan.hasAddress && plan.hasOrderDetails);
  }

  function parseRetryDelayMs(text) {
    const value = String(text || "");
    const match = value.match(/retry\s+(?:in|after)\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
    if (match) {
      const seconds = Number.parseFloat(match[1]);
      if (Number.isFinite(seconds) && seconds > 0) return Math.min(10 * 60 * 1000, Math.ceil(seconds * 1000) + 2000);
    }
    return DEFAULT_AI_COOLDOWN_MS;
  }

  function enterAiCooldown(errorTextValue) {
    const delay = parseRetryDelayMs(errorTextValue);
    aiCooldownUntil = Math.max(aiCooldownUntil, Date.now() + delay);
    if (aiCooldownUntil > lastCooldownLogUntil) {
      lastCooldownLogUntil = aiCooldownUntil;
      if (typeof log === "function") {
        log(`AI đang bị giới hạn 429. PageBot tạm dừng gọi AI khoảng ${Math.ceil(delay / 1000)} giây để tránh retry/spam request.`, "warn");
      }
    }
  }

  function aiCoolingDown() {
    return Date.now() < aiCooldownUntil;
  }

  function canFollowUpOld(convState, now = Date.now()) {
    if (convState?.complete || convState?.waitingForCustomer) return false;
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const today = Array.isArray(convState?.followupTimes)
      ? convState.followupTimes.filter((ts) => Number(ts) >= dayStart.getTime() && Number(ts) <= now)
      : [];
    if (today.length >= MAX_FOLLOWUPS_PER_DAY) return false;
    const last = today.length ? Math.max(...today) : Number(convState?.lastFollowupAt || 0);
    return !last || now - last >= FOLLOWUP_COOLDOWN_MS;
  }

  function recordFollowUp(convState) {
    const now = Date.now();
    const times = Array.isArray(convState.followupTimes) ? convState.followupTimes : [];
    convState.lastFollowupAt = now;
    convState.followupTimes = [...times, now].slice(-12);
  }

  async function waitForStableIncoming(initial, id) {
    let current = initial;
    let previousSignature = incomingSignature(initial);
    let stablePasses = 0;

    for (let pass = 0; pass < MAX_STABLE_PASSES; pass += 1) {
      await wait(CUSTOMER_SETTLE_MS);
      if (!canRun(id)) return null;

      const next = await window.pagebot.chat.snapshot();
      if (!next?.incoming || !sameConversation(current, next)) return null;
      const nextSignature = incomingSignature(next);

      if (nextSignature === previousSignature) {
        stablePasses += 1;
        current = next;
        if (stablePasses >= REQUIRED_STABLE_PASSES) return next;
      } else {
        stablePasses = 0;
        current = next;
        previousSignature = nextSignature;
      }
    }
    return null;
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
    timer = setTimeout(() => void tick(id), Math.max(250, delay));
  }

  async function openCandidate(candidate) {
    if (!candidate?.locator || !window.pagebot.chat.openConversation) return { ok: true };
    return window.pagebot.chat.openConversation(candidate.locator);
  }

  async function analyzeSales(snapshot, mode) {
    const profileId = activeProfileId();
    if (!profileId) throw new Error("Chưa xác định được profile đang mở.");
    if (!window.pagebot.sales?.analyzeFollowup) throw new Error("Sales follow-up runtime chưa sẵn sàng.");
    return window.pagebot.sales.analyzeFollowup(profileId, snapshot, mode);
  }

  async function processCandidate(candidate, id) {
    if (!canRun(id) || aiCoolingDown()) return;
    const candidateKey = candidate?.key || "current-chat";
    if (processingKeys.has(candidateKey)) return;
    processingKeys.add(candidateKey);

    let stateKey = "";
    let signature = "";
    try {
      const opened = await openCandidate(candidate);
      if (!opened?.ok || !canRun(id)) return;

      const first = await window.pagebot.chat.snapshot();
      if (!first?.supportedChat || !first?.inputFound || !first.latestText || !first.incoming) return;
      if ((first.confidence || 0) < 0.68) return;

      stateKey = candidateStateKey(candidate, first);
      signature = incomingSignature(first);
      if (!signature) return;

      let convState = conversationStates.get(stateKey);
      const isFirstVisit = !convState;
      if (!convState) {
        convState = {
          seenSignature: "",
          handledSignature: "",
          lastAnalyzedSignature: "",
          title: first.title || candidate?.label || "",
          locator: candidate?.locator || null,
          salesState: null,
          complete: false,
          lastFollowupAt: 0,
          followupTimes: [],
          waitingForCustomer: false,
          sentOnSignature: ""
        };
        conversationStates.set(stateKey, convState);
      }

      const signatureChanged = Boolean(convState.seenSignature && signature !== convState.seenSignature);
      if (convState.waitingForCustomer) {
        if (!signatureChanged) return;
        // Customer has replied after our previous message. Unlock exactly once,
        // then wait for their whole burst of messages to settle before answering.
        convState.waitingForCustomer = false;
        convState.lastAnalyzedSignature = "";
      }

      if (convState.complete && !signatureChanged) return;
      if (!signatureChanged && !isFirstVisit && signature === convState.lastAnalyzedSignature && !canFollowUpOld(convState)) return;

      let stable = first;
      const needsCustomerSettle = signatureChanged || convState.sentOnSignature;
      if (needsCustomerSettle) {
        stable = await waitForStableIncoming(first, id);
        if (!stable || !canRun(id) || !sameConversation(first, stable)) return;
        signature = incomingSignature(stable);
        if (!signature) return;
      }

      const hasNewIncoming = Boolean(convState.seenSignature && signature !== convState.seenSignature);
      const mode = hasNewIncoming ? "new_message" : "followup_old";
      const customerName = stable.title || candidate?.label || "khách";

      if (typeof log === "function") {
        log(
          mode === "new_message"
            ? `[${customerName}] Khách đã ngừng nhắn tạm thời, bắt đầu xử lý cụm tin mới.`
            : `[${customerName}] Đang rà lại hội thoại cũ chưa hoàn tất.`,
          "info"
        );
      }

      if (aiCoolingDown()) return;
      const plan = await analyzeSales(stable, mode);
      if (!canRun(id)) return;

      convState.lastAnalyzedSignature = signature;
      convState.salesState = plan;
      convState.complete = salesComplete(plan);
      convState.seenSignature = signature;

      if (convState.complete && mode === "followup_old") {
        if (typeof log === "function") log(`[${customerName}] Hội thoại đã hoàn tất, không follow-up lại.`, "success");
        return;
      }
      if (plan?.shouldFollowUp === false) return;
      if (mode === "followup_old" && !canFollowUpOld(convState)) return;

      const text = String(plan?.reply || "").trim();
      if (!text) return;

      const reopened = await openCandidate(candidate);
      if (!reopened?.ok || !canRun(id)) return;
      const latest = await window.pagebot.chat.snapshot();
      if (!latest?.incoming || !sameConversation(stable, latest)) {
        if (typeof log === "function") log(`[${customerName}] Hội thoại đã đổi trước lúc gửi. Hủy để tránh nhắn nhầm.`, "warn");
        return;
      }

      const latestSignature = incomingSignature(latest);
      if (latestSignature !== signature) {
        if (typeof log === "function") log(`[${customerName}] Khách vẫn đang nhắn thêm. Hủy câu hiện tại và chờ khách nói xong.`, "warn");
        convState.seenSignature = latestSignature || convState.seenSignature;
        convState.lastAnalyzedSignature = "";
        return;
      }
      if (candidateStateKey(candidate, latest) !== stateKey) {
        if (typeof log === "function") log(`[${customerName}] Thread key không còn trùng. Không gửi.`, "warn");
        return;
      }

      const recentOutgoing = Array.isArray(latest.messages)
        ? latest.messages.filter((item) => item?.direction === "outgoing").slice(-6).map((item) => item?.text)
        : [];
      if (recentOutgoing.some((item) => similarText(text, item)) || similarText(text, lastSentText.get(stateKey))) {
        if (typeof log === "function") log(`[${customerName}] Đã chặn câu trả lời trùng.`, "warn");
        return;
      }

      const sent = await window.pagebot.chat.send(text);
      if (!sent?.ok) throw new Error(sent?.reason || "Không gửi được tin nhắn vào Facebook.");

      convState.handledSignature = signature;
      convState.sentOnSignature = signature;
      convState.waitingForCustomer = true;
      if (mode === "followup_old") recordFollowUp(convState);
      lastSentText.set(stateKey, text);

      const output = document.getElementById("reply-output");
      if (output) output.value = text;
      if (typeof state !== "undefined") state.lastSuggestion = text;
      if (typeof log === "function") {
        const salesLabel = plan?.status ? ` · ${plan.status}` : "";
        log(
          `[${customerName}] ${sent.verified ? "Đã gửi" : "Đã thao tác gửi"}${salesLabel}. Đang chờ khách trả lời, sẽ không nhắn thêm vào thread này trước khi có tin mới.`,
          sent.verified ? "success" : "warn"
        );
      }
    } catch (error) {
      const text = cleanError(error);
      if (/\b429\b|quota|rate limit|exceeded your current/i.test(text)) {
        enterAiCooldown(text);
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
    if (aiCoolingDown()) {
      return schedule(id, Math.min(POLL_MS, Math.max(1000, aiCooldownUntil - Date.now())));
    }
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
        trackedConversations: conversationStates.size,
        aiCooldownUntil,
        at: Date.now()
      };

      for (const candidate of batch) {
        if (!canRun(id) || aiCoolingDown()) break;
        await processCandidate(candidate, id);
      }
    } catch (error) {
      if (typeof log === "function") log(`Đa luồng: ${cleanError(error)}`, "error");
    } finally {
      busy = false;
      const delay = aiCoolingDown() ? Math.max(1000, aiCooldownUntil - Date.now()) : POLL_MS;
      schedule(id, delay);
    }
  }

  function activate() {
    activationId += 1;
    const id = activationId;
    clearTimer();
    processingKeys.clear();
    if (!canRun(id)) return;
    if (typeof log === "function") {
      log("Auto Sales đã bật. Bot chỉ trả lời sau khi cụm tin của khách ổn định; sau mỗi lần gửi sẽ chờ khách phản hồi rồi mới được nhắn tiếp.", "success");
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
