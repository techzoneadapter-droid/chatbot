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

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") installLazyInit();
  });

  document.addEventListener("DOMContentLoaded", () => {
    removeLegacyCookieUi();
  });
})();
