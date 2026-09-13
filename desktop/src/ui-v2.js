(() => {
  const AUTO_SCRIPT = "auto-chat-current.js";
  let autoScriptPromise = null;
  let activeTab = "chat";

  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

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

  function bindTabs() {
    $all(".tool-tab").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.toolTab));
    });
    let initial = "chat";
    try { initial = sessionStorage.getItem("pagebot.toolTab") || "chat"; } catch {}
    setTab(initial, false);
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

  function bindProfileEvents() {
    if (!window.pagebot?.onEvent) return;
    window.pagebot.onEvent((event) => {
      if (event?.type !== "active-profile" || !event.payload) return;
      void disarmPersistedAuto(event.payload);
      setTab("chat", false);
    });
  }

  function markReady() {
    requestAnimationFrame(() => document.body.classList.add("pagebot-ready"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindTabs();
    bindOnDemandAuto();
    bindActivityActions();
    bindProfileEvents();
    markReady();
  });
})();
