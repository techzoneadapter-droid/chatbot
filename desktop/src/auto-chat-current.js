(() => {
  const POLL_MS = 6500;
  const QUIET_MS = 950;
  const MAX_STABLE_PASSES = 3;
  const MAX_SCAN_PER_CYCLE = 3;
  const FOLLOWUP_COOLDOWN_MS = 45 * 60 * 1000;
  const MAX_FOLLOWUPS_PER_DAY = 3;
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

  function activeProfileId() {
    return typeof state !== "undefined" && state.activeProfile?.id ? state.activeProfile.id : null;
  }

  function salesComplete(plan) {
    if (!plan) return false;
    if (plan.status === "done" || plan.status === "order_confirmed") return true;
    return Boolean(plan.hasOrderIntent && plan.orderConfirmed && plan.hasPhone && plan.hasName && plan.hasAddress && plan.hasOrderDetails);
  }

  function canFollowUpOld(convState, now = Date.now()) {
    if (convState?.complete) return false;
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
    if (!canRun(id)) return;
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
          followupTimes: []
        };
        conversationStates.set(stateKey, convState);
      }

      if (convState.complete && signature === convState.seenSignature) return;
      const hasNewIncoming = Boolean(convState.seenSignature && signature !== convState.seenSignature);
      if (!hasNewIncoming && !isFirstVisit && signature === convState.lastAnalyzedSignature && !canFollowUpOld(convState)) return;

      let stable = first;
      if (hasNewIncoming) {
        stable = await waitForStableIncoming(first, id);
        if (!stable || !canRun(id) || !sameConversation(first, stable)) return;
        signature = incomingSignature(stable);
        if (!signature) return;
      }

      const mode = hasNewIncoming ? "new_message" : "followup_old";
      const customerName = stable.title || candidate?.label || "khách";
      if (typeof log === "function") {
        log(
          mode === "new_message"
            ? `[${customerName}] Có tin mới: ${String(stable.latestText).slice(0, 120)}`
            : `[${customerName}] Đang rà lại hội thoại cũ để xem còn thiếu bước chốt đơn hay thông tin giao hàng.`,
          "info"
        );
      }

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
        if (typeof log === "function") log(`[${customerName}] Khách vừa nhắn thêm. Hủy câu cũ và phân tích lại ở vòng tiếp theo.`, "warn");
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
        if (mode === "followup_old") recordFollowUp(convState);
        return;
      }

      const sent = await window.pagebot.chat.send(text);
      if (!sent?.ok) throw new Error(sent?.reason || "Không gửi được tin nhắn vào Facebook.");

      convState.handledSignature = signature;
      if (mode === "followup_old") recordFollowUp(convState);
      lastSentText.set(stateKey, text);
      const output = document.getElementById("reply-output");
      if (output) output.value = text;
      if (typeof state !== "undefined") state.lastSuggestion = text;
      if (typeof log === "function") {
        const salesLabel = plan?.status ? ` · ${plan.status}` : "";
        log(
          `[${customerName}] ${sent.verified ? "Đã gửi" : "Đã thao tác gửi"}${salesLabel}.`,
          sent.verified ? "success" : "warn"
        );
      }
    } catch (error) {
      const text = cleanError(error);
      if (typeof log === "function") log(`Đa luồng: ${text}`, "error");
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
        trackedConversations: conversationStates.size,
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
      log("Auto Sales đã bật. PageBot sẽ rà cả hội thoại cũ chưa hoàn tất, theo dõi trạng thái từng khách và khóa thao tác gửi để không trộn thread.", "success");
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
