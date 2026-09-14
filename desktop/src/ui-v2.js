(() => {
  const AUTO_SCRIPT = "auto-chat-current.js";
  const META_MODEL = "muse-spark-1.3";
  let autoScriptPromise = null;
  let aiStatusPromise = null;
  let activeTab = "chat";
  let updateBusy = false;
  const metaSyncing = new Set();

  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

  function installRuntimeStyle() {
    if (document.getElementById("pagebot-v2-runtime-style")) return;
    const style = document.createElement("style");
    style.id = "pagebot-v2-runtime-style";
    style.textContent = `
      body.ai-panel-collapsed .tool-tabs { display: none !important; }
      .sidebar-update { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(121,136,158,.16); }
      .sidebar-update button { width: 100%; min-height: 34px; border: 1px solid #d8e0ea; border-radius: 9px; background: #fff; color: #405067; font-weight: 700; cursor: pointer; }
      .sidebar-update button:hover { background: #f6f9fc; }
      .sidebar-update button:disabled { opacity: .65; cursor: default; }
      .sidebar-update small { display: block; margin-top: 6px; color: #8290a3; font-size: 10px; line-height: 1.35; }
      body.profile-opening #browser-loading { opacity: 1; }
      @media (max-width: 1280px) {
        .sidebar { width: 260px !important; }
        .browser-bar { left: 260px !important; }
        .workspace-empty { left: 260px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  async function ensureAiStatus() {
    if (window.__pagebotAiStatusLoaded) return true;
    if (aiStatusPromise) return aiStatusPromise;
    if (typeof loadSecretStatus !== "function") return false;
    aiStatusPromise = Promise.resolve()
      .then(() => loadSecretStatus())
      .then(() => {
        window.__pagebotAiStatusLoaded = true;
        if (typeof updateApiStatus === "function") updateApiStatus();
        return true;
      })
      .catch((error) => {
        aiStatusPromise = null;
        if (typeof log === "function") log(error?.message || String(error), "error");
        return false;
      });
    return aiStatusPromise;
  }

  function setTab(name, remember = true) {
    const valid = new Set(["chat", "ai", "network", "account"]);
    activeTab = valid.has(name) ? name : "chat";
    $all(".tool-tab").forEach((button) => {
      const active = button.dataset.toolTab === activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    $all("[data-tool-pane]").forEach((pane) => {
      pane.classList.toggle("tool-pane-active", pane.dataset.toolPane === activeTab);
    });
    if (remember) {
      try { sessionStorage.setItem("pagebot.toolTab", activeTab); } catch {}
    }
    if (activeTab === "ai") void ensureAiStatus();
  }

  function loadAutoEngine() {
    if (window.__pagebotAutoEngineLoaded) return Promise.resolve(true);
    if (autoScriptPromise) return autoScriptPromise;
    autoScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = AUTO_SCRIPT;
      script.dataset.pagebotAutoRuntime = "1";
      script.onload = () => {
        window.__pagebotAutoEngineLoaded = true;
        resolve(true);
      };
      script.onerror = () => {
        autoScriptPromise = null;
        reject(new Error("Không nạp được Auto Chat runtime."));
      };
      document.body.appendChild(script);
    });
    return autoScriptPromise;
  }

  async function syncAutoToggle() {
    const toggle = $("#auto-reply");
    if (!toggle) return;
    if (!toggle.checked) {
      window.dispatchEvent(new CustomEvent("pagebot:chatbot-engine-change"));
      return;
    }
    try {
      await loadAutoEngine();
      window.__pagebotChatbotEngine = "light";
      window.dispatchEvent(new CustomEvent("pagebot:chatbot-engine-change"));
    } catch (error) {
      toggle.checked = false;
      if (typeof log === "function") log(error?.message || String(error), "error");
    }
  }

  async function disarmPersistedAuto(profile) {
    if (!profile?.id || !profile.autoReply) return;
    try {
      const updated = await window.pagebot.profiles.update(profile.id, { autoReply: false });
      if (typeof state !== "undefined" && state.activeProfile?.id === profile.id) {
        state.activeProfile = updated;
        const toggle = $("#auto-reply");
        if (toggle) toggle.checked = false;
        if (typeof renderProfiles === "function") renderProfiles();
      }
      if (typeof log === "function") log("Auto Chat cũ đã được tắt khi mở profile. Hãy bật lại nếu muốn dùng trong phiên này.", "info");
    } catch {}
  }

  async function preferMetaProfile(profile) {
    if (!profile?.id || metaSyncing.has(profile.id)) return;
    const alreadyMeta = profile.aiProvider === "meta" && /^muse-/i.test(String(profile.aiModel || ""));
    if (alreadyMeta) return;
    metaSyncing.add(profile.id);
    try {
      const updated = await window.pagebot.profiles.update(profile.id, {
        aiProvider: "meta",
        aiModel: META_MODEL
      });
      if (typeof state !== "undefined" && state.activeProfile?.id === profile.id) {
        state.activeProfile = updated;
        if (typeof renderProfiles === "function") renderProfiles();
        if (typeof renderAiPanel === "function") renderAiPanel();
      }
      if (typeof log === "function") log(`AI của ${updated.name || "profile"} đã chuyển sang Meta Muse Spark 1.3.`, "success");
    } catch (error) {
      if (typeof log === "function") log(error?.message || String(error), "error");
    } finally {
      metaSyncing.delete(profile.id);
    }
  }

  function bindTabs() {
    $all(".tool-tab").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.toolTab));
    });
    // Always start in Chat so opening PageBot never touches AI secure storage.
    setTab("chat", false);
  }

  function bindOnDemandAuto() {
    const toggle = $("#auto-reply");
    if (!toggle) return;
    toggle.checked = false;
    toggle.addEventListener("change", () => void syncAutoToggle());
  }

  function bindActivityActions() {
    $("#clear-activity")?.addEventListener("click", () => {
      const activity = $("#activity");
      if (activity) activity.innerHTML = "";
    });
  }

  function installNonBlockingProfileOpen() {
    if (typeof setBusy !== "function" || window.__pagebotBusyOptimized) return;
    const originalSetBusy = setBusy;
    window.__pagebotBusyOptimized = true;
    setBusy = function pageBotSetBusy(active, text = "") {
      if (text === "Đang mở profile...") {
        document.body.classList.toggle("profile-opening", Boolean(active));
        return;
      }
      if (!active) document.body.classList.remove("profile-opening");
      return originalSetBusy(active, text);
    };
  }

  function updateButtonState(payload = {}) {
    const button = $("#pagebot-update-button");
    const text = $("#pagebot-update-status");
    if (!button || !text) return;
    const phase = payload.phase || "idle";
    if (phase === "downloading") button.textContent = `↓ Đang tải ${Math.round(Number(payload.progress || 0))}%`;
    else if (phase === "checking") button.textContent = "↻ Đang kiểm tra...";
    else if (phase === "ready") button.textContent = "✓ Cài bản mới";
    else button.textContent = "↻ Cập nhật PageBot";
    text.textContent = payload.message || (payload.packaged === false ? "Bản DEV · updater dùng ở bản cài đặt" : `Phiên bản ${payload.currentVersion || ""}`.trim());
  }

  async function runUpdate() {
    if (updateBusy || !window.pagebot?.updates) return;
    updateBusy = true;
    const button = $("#pagebot-update-button");
    if (button) button.disabled = true;
    try {
      const checked = await window.pagebot.updates.check();
      updateButtonState(checked);
      if (checked?.phase === "dev" || checked?.phase === "latest") return;
      if (checked?.phase !== "available") return;
      if (typeof log === "function") log(`Có PageBot ${checked.availableVersion}. Đang tải bản cập nhật...`, "success");
      const downloaded = await window.pagebot.updates.download();
      updateButtonState(downloaded);
      if (downloaded?.phase === "ready") {
        if (typeof log === "function") log("Đã tải xong bản mới. PageBot sẽ đóng và cài đặt ngay.", "success");
        await window.pagebot.updates.install();
      }
    } catch (error) {
      if (typeof log === "function") log(error?.message || String(error), "error");
    } finally {
      updateBusy = false;
      if (button) button.disabled = false;
    }
  }

  function installUpdateButton() {
    if ($("#pagebot-update-button")) return;
    const host = $(".sidebar-note");
    if (!host || !window.pagebot?.updates) return;
    const box = document.createElement("div");
    box.className = "sidebar-update";
    box.innerHTML = `<button type="button" id="pagebot-update-button">↻ Cập nhật PageBot</button><small id="pagebot-update-status">Chỉ kiểm tra khi bạn bấm</small>`;
    host.appendChild(box);
    $("#pagebot-update-button")?.addEventListener("click", () => void runUpdate());
    window.pagebot.updates.status().then(updateButtonState).catch(() => {});
  }

  function bindProfileEvents() {
    if (!window.pagebot?.onEvent) return;
    window.pagebot.onEvent((event) => {
      if (event?.type === "active-profile" && event.payload) {
        void disarmPersistedAuto(event.payload);
        void preferMetaProfile(event.payload);
        setTab("chat", false);
      }
      if (event?.type === "update-state") updateButtonState(event.payload || {});
    });
  }

  function markReady() {
    requestAnimationFrame(() => document.body.classList.add("pagebot-ready"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    installRuntimeStyle();
    installNonBlockingProfileOpen();
    bindTabs();
    bindOnDemandAuto();
    bindActivityActions();
    bindProfileEvents();
    installUpdateButton();
    markReady();
  });
})();
