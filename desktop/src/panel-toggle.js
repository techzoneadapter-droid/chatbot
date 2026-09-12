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
    loadScriptOnce("auto-chat-current.js", "data-pagebot-auto-chat-current", "1");
  }

  function moveDeleteProfileToHeader() {
    const header = document.querySelector(".ai-header");
    const toggle = document.getElementById("toggle-ai-panel");
    const deleteButton = document.getElementById("delete-profile");
    if (!header || !toggle || !deleteButton || deleteButton.dataset.headerReady === "1") return;

    let actions = header.querySelector(".ai-header-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "ai-header-actions";
      actions.style.display = "flex";
      actions.style.alignItems = "center";
      actions.style.gap = "6px";
      header.appendChild(actions);
    }

    deleteButton.dataset.headerReady = "1";
    deleteButton.textContent = "🗑 Xóa profile";
    deleteButton.title = "Xóa profile đang mở";
    deleteButton.style.padding = "7px 9px";
    deleteButton.style.whiteSpace = "nowrap";
    actions.appendChild(deleteButton);
    actions.appendChild(toggle);
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
    moveDeleteProfileToHeader();
    loadAiHelpers();
    const button = document.getElementById("toggle-ai-panel");
    if (!button) return;
    button.addEventListener("click", () => void setCollapsed(!collapsed));
    window.pagebot.onEvent((event) => {
      if (event && event.type === "active-profile") {
        moveDeleteProfileToHeader();
        void window.pagebot.layout.setAiPanelCollapsed(collapsed).catch(() => {});
      }
    });
    void setCollapsed(false);
  });
})();
