(() => {
  function installLazyInit() {
    if (typeof init !== "function") return;
    init = async function pageBotLazyInit() {
      bindStaticEvents();
      window.pagebot.onEvent(handleMainEvent);
      await Promise.all([loadProfiles(), loadSecretStatus()]);
      renderProfiles();
      renderAiPanel();
      if (typeof log === "function") {
        log("PageBot đã sẵn sàng. Profile, AI và Auto Chat chỉ chạy khi bạn chủ động dùng.", "success");
      }
    };
  }

  function removeLegacyCookieUi() {
    const button = document.getElementById("cookie-tool");
    if (!button) return;
    button.style.display = "none";
    button.disabled = true;
    button.setAttribute("aria-hidden", "true");
    button.tabIndex = -1;
  }

  function loadLightAutoChat() {
    if (document.querySelector('script[data-pagebot-light-auto="1"]')) return;
    const script = document.createElement("script");
    script.src = "auto-chat-current.js";
    script.defer = true;
    script.dataset.pagebotLightAuto = "1";
    document.body.appendChild(script);
  }

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") installLazyInit();
  });

  document.addEventListener("DOMContentLoaded", () => {
    removeLegacyCookieUi();
    loadLightAutoChat();
  });
})();
