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

  function installMetaDevShortcut() {
    const shortcuts = document.querySelector(".browser-shortcuts");
    if (!shortcuts || document.getElementById("meta-dev-shortcut")) return false;

    const style = document.createElement("style");
    style.textContent = ".browser-shortcut.meta-dev{color:#0f8b55}.browser-shortcut.meta-dev:hover{background:#effaf5;border-color:#ccebdd}";
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "meta-dev-shortcut";
    button.type = "button";
    button.className = "browser-shortcut meta-dev";
    button.title = "Meta Graph API Explorer";
    button.innerHTML = "🔑 <span>Meta Dev</span>";
    button.addEventListener("click", async () => {
      if (typeof state !== "undefined" && !state.activeProfile) {
        if (typeof log === "function") log("Hãy mở một profile trước khi mở Meta Graph API Explorer.", "warn");
        return;
      }
      try {
        await window.pagebot.browser.navigate("https://developers.facebook.com/tools/explorer/");
      } catch (error) {
        if (typeof log === "function") log(errorText(error), "error");
      }
    });
    shortcuts.appendChild(button);
    return true;
  }

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") installLazyInit();
  });

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (installMetaDevShortcut()) return;
      requestAnimationFrame(() => installMetaDevShortcut());
    }, 0);
  });
})();
