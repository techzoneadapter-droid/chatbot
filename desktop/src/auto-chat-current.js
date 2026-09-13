(() => {
  const POLL_MS = 6500;
  const CUSTOMER_SETTLE_MS = 3500;
  const REQUIRED_STABLE_PASSES = 2;
  const MAX_STABLE_PASSES = 5;
  const MAX_SCAN_PER_CYCLE = 3;
  const FOLLOWUP_COOLDOWN_MS = 8 * 60 * 60 * 1000;
  const MAX_FOLLOWUPS_PER_DAY = 1;
  const DEFAULT_AI_COOLDOWN_MS = 60 * 1000;
  const MIN_CONFIDENCE_TO_SEND = 0.72;
  const STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  let activationId = 0;
  let timer = null;
  let busy = false;
  let roundRobinCursor = 0;
  let aiCooldownUntil = 0;
  let lastCooldownLogUntil = 0;
  let hydratedProfileId = null;

  const conversationStates = new Map();
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
          .slice(-10)
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
    return typeof state !== "undefined" && state.activeProfile?.id ? String(state.activeProfile.id) : "";
  }

  function storageKey(profileId) {
    return `pagebot:sales-orchestrator:${profileId}`;
  }

  function createState(first, candidate) {
    return {
      seenSignature: "",
      handledSignature: "",
      lastAnalyzedSignature: "",
      title: first?.title || candidate?.label || "",
      salesState: null,
      complete: false,
      waitingForCustomer: false,
      handoff: false,
      lastFollowupAt: 0,
      followupTimes: [],
      lastReply: "",
      lastAction: "",
      updatedAt: Date.now()
    };
  }

  function hydrateConversationState() {
    const profileId = activeProfileId();
    if (!profileId || hydratedProfileId === profileId) return;
    hydratedProfileId = profileId;
    conversationStates.clear();

    try {
      const raw = JSON.parse(localStorage.getItem(storageKey(profileId)) || "{}");
      const now = Date.now();
      for (const [key, value] of Object.entries(raw)) {
        if (!value || typeof value !== "object") continue;
        const updatedAt = Number(value.updatedAt || 0);
        if (updatedAt && now - updatedAt > STATE_TTL_MS) continue;
        conversationStates.set(key, {
          seenSignature: String(value.seenSignature || ""),
          handledSignature: String(value.handledSignature || ""),
          lastAnalyzedSignature: String(value.lastAnalyzedSignature || ""),
          title: String(value.title || ""),
          salesState: value.salesState && typeof value.salesState === "object" ? value.salesState : null,
          complete: Boolean(value.complete),
          waitingForCustomer: Boolean(value.waitingForCustomer),
          handoff: Boolean(value.handoff),
          lastFollowupAt: Number(value.lastFollowupAt || 0),
          followupTimes: Array.isArray(value.followupTimes) ? value.followupTimes.map(Number).filter(Number.isFinite).slice(-8) : [],
          lastReply: String(value.lastReply || ""),
          lastAction: String(value.lastAction || ""),
          updatedAt: updatedAt || now
        });
      }
    } catch {}
  }

  function persistConversationState() {
    const profileId = activeProfileId();
    if (!profileId) return;
    try {
      const serializable = {};
      const now = Date.now();
      for (const [key, value] of conversationStates.entries()) {
        if (now - Number(value.updatedAt || now) > STATE_TTL_MS) continue;
        serializable[key] = value;
      }
      localStorage.setItem(storageKey(profileId), JSON.stringify(serializable));
    } catch {}
  }

  function touch(convState) {
    convState.updatedAt = Date.now();
    persistConversationState();
  }

  function salesComplete(plan) {
    if (!plan) return false;
    if (plan.action === "close" || plan.status === "done" || plan.status === "order_confirmed") return true;
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
        log(`AI đang bị giới hạn 429. PageBot tạm dừng toàn bộ gọi AI khoảng ${Math.ceil(delay / 1000)} giây.`, "warn");
      }
    }
  }

  function aiCoolingDown() {
    return Date.now() < aiCooldownUntil;
  }

  function canFollowUpOld(convState, now = Date.now()) {
    if (convState?.complete || convState?.waitingForCustomer || convState?.handoff) return false;
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
    convState.followupTimes = [...times, now].slice(-8);
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
      if (!nextSignature) return null;

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
    timer = setTimeout(() => void tick(id), Math.max(500, delay));
  }

  async function openCandidate(candidate) {
    if (!candidate?.locator || !window.pagebot.chat.openConversation) return { ok: true };
    return window.pagebot.chat.openConversation(candidate.locator);
  }

  async function analyzeSales(snapshot, mode) {
    const profileId = activeProfileId();
    if (!profileId) throw new Error("Chưa xác định được profile đang mở.");
    if (!window.pagebot.sales?.analyzeFollowup) throw new Error("Sales orchestrator chưa sẵn sàng.");
    return window.pagebot.sales.analyzeFollowup(profileId, snapshot, mode);
  }

  function shouldAutoSend(plan, mode, convState) {
    if (!plan) return false;
    if (plan.action === "wait" || plan.action === "handoff" || plan.action === "close") return false;
    if ((Number(plan.confidence) || 0) < MIN_CONFIDENCE_TO_SEND) return false;
    if (!String(plan.reply || "").trim()) return false;
    if (mode === "followup_old") {
      if (plan.action !== "follow_up") return false;
      if (!canFollowUpOld(convState)) return false;
    }
    return plan.action === "reply" || plan.action === "follow_up";
  }

  async function processCandidate(candidate, id) {
    if (!canRun(id) || aiCoolingDown()) return;
    hydrateConversationState();

    const candidateKey = candidate?.key || "current-chat";
    if (processingKeys.has(candidateKey)) return;
    processingKeys.add(candidateKey);

    let stateKey = "";
    try {
      const opened = await openCandidate(candidate);
      if (!opened?.ok || !canRun(id)) return;

      const first = await window.pagebot.chat.snapshot();
      if (!first?.supportedChat || !first?.inputFound || !first.latestText || !first.incoming) return;
      if ((first.confidence || 0) < 0.68) return;

      stateKey = candidateStateKey(candidate, first);
      let signature = incomingSignature(first);
      if (!signature) return;

      let convState = conversationStates.get(stateKey);
      const isFirstVisit = !convState;
      if (!convState) {
        convState = createState(first, candidate);
        conversationStates.set(stateKey, convState);
      }

      const signatureChanged = Boolean(convState.seenSignature && signature !== convState.seenSignature);

      if (convState.waitingForCustomer) {
        if (!signatureChanged) return;
        convState.waitingForCustomer = false;
        convState.handoff = false;
        convState.complete = false;
        convState.lastAnalyzedSignature = "";
        touch(convState);
      }

      if (convState.complete && !signatureChanged) return;
      if (convState.handoff && !signatureChanged) return;
      if (convState.handledSignature === signature && !signatureChanged) return;

      const stable = await waitForStableIncoming(first, id);
      if (!stable || !canRun(id) || !sameConversation(first, stable)) return;
      signature = incomingSignature(stable);
      if (!signature) return;

      const hasNewIncoming = Boolean(convState.seenSignature && signature !== convState.seenSignature);
      const mode = hasNewIncoming ? "new_message" : "followup_old";
      const customerName = stable.title || candidate?.label || "khách";

      if (mode === "followup_old" && !isFirstVisit && signature === convState.lastAnalyzedSignature && !canFollowUpOld(convState)) return;

      if (typeof log === "function") {
        log(
          mode === "new_message"
            ? `[${customerName}] Khách đã ngừng nhắn, PageBot đang xử lý cụm tin mới.`
            : `[${customerName}] Đang đánh giá hội thoại cũ xem có nên follow-up hay nên chờ.`,
          "info"
        );
      }

      const plan = await analyzeSales(stable, mode);
      if (!canRun(id)) return;

      convState.lastAnalyzedSignature = signature;
      convState.seenSignature = signature;
      convState.salesState = plan;
      convState.lastAction = String(plan?.action || "");
      convState.complete = salesComplete(plan);
      touch(convState);

      if (plan?.action === "wait") {
        convState.waitingForCustomer = Boolean(plan.pageWaitingForCustomer || !plan.customerWaitingForUs);
        touch(convState);
        if (typeof log === "function") log(`[${customerName}] WAIT: đang chờ khách, không gửi thêm.`, "info");
        return;
      }

      if (plan?.action === "handoff") {
        convState.handoff = true;
        convState.waitingForCustomer = true;
        touch(convState);
        if (typeof log === "function") {
          log(`[${customerName}] HANDOFF: ${plan.handoffReason || "AI không đủ chắc chắn để tự trả lời."}`, "warn");
        }
        return;
      }

      if (plan?.action === "close" || convState.complete) {
        convState.complete = true;
        touch(convState);
        if (typeof log === "function") log(`[${customerName}] CLOSE: hội thoại đã hoàn tất, dừng Auto cho thread này.`, "success");
        return;
      }

      if (!shouldAutoSend(plan, mode, convState)) {
        if (typeof log === "function" && Number(plan?.confidence || 0) < MIN_CONFIDENCE_TO_SEND) {
          log(`[${customerName}] Độ tin cậy ${(Number(plan?.confidence || 0) * 100).toFixed(0)}% < 72%, không tự gửi.`, "warn");
        }
        return;
      }

      const text = String(plan.reply || "").trim();
      const reopened = await openCandidate(candidate);
      if (!reopened?.ok || !canRun(id)) return;

      const latest = await window.pagebot.chat.snapshot();
      if (!latest?.incoming || !sameConversation(stable, latest)) {
        if (typeof log === "function") log(`[${customerName}] Thread đã đổi trước lúc gửi, hủy để tránh nhắn nhầm.`, "warn");
        return;
      }

      const latestSignature = incomingSignature(latest);
      if (latestSignature !== signature) {
        convState.lastAnalyzedSignature = "";
        touch(convState);
        if (typeof log === "function") log(`[${customerName}] Khách vừa nhắn thêm, hủy bản cũ và chờ khách nói xong.`, "warn");
        return;
      }
      if (candidateStateKey(candidate, latest) !== stateKey) {
        if (typeof log === "function") log(`[${customerName}] Thread key không trùng, không gửi.`, "warn");
        return;
      }

      const recentOutgoing = Array.isArray(latest.messages)
        ? latest.messages.filter((item) => item?.direction === "outgoing").slice(-8).map((item) => item?.text)
        : [];
      if (recentOutgoing.some((item) => similarText(text, item)) || similarText(text, convState.lastReply)) {
        if (typeof log === "function") log(`[${customerName}] Chặn câu trả lời trùng.`, "warn");
        return;
      }

      const sent = await window.pagebot.chat.send(text);
      if (!sent?.ok) throw new Error(sent?.reason || "Không gửi được tin nhắn vào Facebook.");

      convState.handledSignature = signature;
      convState.lastReply = text;
      convState.waitingForCustomer = true;
      convState.handoff = false;
      if (mode === "followup_old") recordFollowUp(convState);
      touch(convState);

      const output = document.getElementById("reply-output");
      if (output) output.value = text;
      if (typeof state !== "undefined") state.lastSuggestion = text;
      if (typeof log === "function") {
        log(
          `[${customerName}] ${sent.verified ? "Đã gửi" : "Đã thao tác gửi"} · ${plan.action || "reply"}. Khóa thread và chờ khách trả lời.`,
          sent.verified ? "success" : "warn"
        );
      }
    } catch (error) {
      const text = cleanError(error);
      if (/\b429\b|quota|rate limit|exceeded your current/i.test(text)) {
        enterAiCooldown(text);
      } else if (typeof log === "function") {
        log(`Auto Sales: ${text}`, "error");
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
    hydrateConversationState();

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
      const text = cleanError(error);
      if (/\b429\b|quota|rate limit|exceeded your current/i.test(text)) enterAiCooldown(text);
      else if (typeof log === "function") log(`Auto Sales: ${text}`, "error");
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
    hydratedProfileId = null;
    hydrateConversationState();
    if (!canRun(id)) return;

    if (typeof log === "function") {
      log("Auto Sales Orchestrator đã bật: đợi khách nói xong, mỗi thread có state riêng, WAIT/HANDOFF/CLOSE rõ ràng và chỉ 1 follow-up cũ/ngày.", "success");
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
