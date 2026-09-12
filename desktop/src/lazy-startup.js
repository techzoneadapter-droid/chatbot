(() => {
  // renderer.js is loaded before this file. Replace only its startup routine so
  // normal renderer event handlers stay intact, but no profile/browser/proxy is
  // opened until the user explicitly clicks a profile.
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
})();
