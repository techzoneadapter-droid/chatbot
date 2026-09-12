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
        log("PageBot đã sẵn sàng. Chỉ mở profile, proxy, AI hoặc Auto Chat khi bạn bật chúng.", "success");
      }
    };
  }

  // This file is intentionally loaded before renderer.js. readyState becomes
  // interactive after all parser scripts (including renderer.js) have executed,
  // but before DOMContentLoaded invokes renderer's init().
  document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") installLazyInit();
  });
})();
