(() => {
  function installLazyInit() {
    if (typeof init !== "function") return;
    init = async function pageBotLazyInit() {
      bindStaticEvents();
      window.pagebot.onEvent(handleMainEvent);
      // Startup only reads the lightweight profile list. AI secure-storage status,
      // browser sessions, proxy, chat readers and Auto runtimes are all deferred.
      await loadProfiles();
      renderProfiles();
      renderAiPanel();
      if (typeof log === "function") {
        log("PageBot sẵn sàng. Không profile, proxy, AI, updater hay Auto Chat nào chạy nền khi mở app.", "success");
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
