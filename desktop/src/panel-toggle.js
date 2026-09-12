(() => {
  let collapsed = false;

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
