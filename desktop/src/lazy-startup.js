(() => {
  // Register before renderer.js. This owns DOMContentLoaded and intentionally
  // initializes only the lightweight shell. Browser profiles are opened only
  // after the user clicks one, which keeps DEV startup fast even with proxies.
  document.addEventListener("DOMContentLoaded", (event) => {
    event.stopImmediatePropagation();

    Promise.resolve().then(async () => {
      try {
        bindStaticEvents();
        window.pagebot.onEvent(handleMainEvent);
        await Promise.all([loadProfiles(), loadSecretStatus()]);
        renderProfiles();
        renderAiPanel();
        if (typeof log === "function") {
          log("PageBot đã sẵn sàng. Chọn profile bên trái khi cần mở Facebook.", "success");
        }
      } catch (error) {
        if (typeof log === "function") log(errorText(error), "error");
      }
    });
  }, true);
})();
