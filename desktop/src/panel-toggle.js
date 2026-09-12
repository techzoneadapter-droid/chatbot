(() => {
  let collapsed = false;

  function loadScriptOnce(src, dataKey, dataValue) {
    if (document.querySelector(`script[${dataKey}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.setAttribute(dataKey, dataValue);
    script.async = false;
    document.body.appendChild(script);
  }

  function loadAiHelpers() {
    // The control center establishes the selected Auto Chat engine first. The
    // actual Auto helpers stay dormant until the user explicitly enables one.
    loadScriptOnce("control-center.js", "data-pagebot-control-center", "1");
    loadScriptOnce("token-panel.js", "data-pagebot-token-panel", "1");
    loadScriptOnce("ai-chat-focus.js", "data-pagebot-ai-chat-focus", "1");
    loadScriptOnce("ai-purpose-quality.js", "data-pagebot-ai-purpose-quality", "1");
    loadScriptOnce("auto-chat-current.js", "data-pagebot-auto-chat-current", "1");
  }

  async function setCollapsed(next) {
    collapsed = Boolean(next);
    document.body.classList.toggle("ai-panel-collapsed", collapsed);
    const button = document.getElementById("toggle-ai-panel");
    if (button) {
      button.textContent = collapsed ? "‹" : "›";
      button.title = collapsed ? "Mở trợ lý AI" : "Thu gọn trợ lý AI";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    try {
      await window.pagebot.layout.setAiPanelCollapsed(collapsed);
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadAiHelpers();
    const button = document.getElementById("toggle-ai-panel");
    if (!button) return;
    button.addEventListener("click", () => void setCollapsed(!collapsed));
    window.pagebot.onEvent((event) => {
      if (event && event.type === "active-profile") {
        void window.pagebot.layout.setAiPanelCollapsed(collapsed).catch(() => {});
      }
    });
    void setCollapsed(false);
  });
})();
