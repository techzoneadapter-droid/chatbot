(() => {
  let collapsed = false;

  function loadAiChatFocus() {
    if (document.querySelector('script[data-pagebot-ai-chat-focus]')) return;
    const script = document.createElement("script");
    script.src = "ai-chat-focus.js";
    script.dataset.pagebotAiChatFocus = "1";
    script.defer = true;
    document.body.appendChild(script);
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
    loadAiChatFocus();
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
