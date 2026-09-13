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
        log("PageBot sẵn sàng. Không profile, proxy, AI hay Auto Chat nào tự chạy khi mở app.", "success");
      }
    };
  }

  function disableLegacyCookieUi() {
    const button = document.getElementById("cookie-tool");
    if (!button) return;
    button.hidden = true;
    button.disabled = true;
    button.setAttribute("aria-hidden", "true");
    button.tabIndex = -1;
  }

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") installLazyInit();
  });

  document.addEventListener("DOMContentLoaded", disableLegacyCookieUi);
})();
