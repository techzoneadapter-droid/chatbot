(() => {
  document.addEventListener("DOMContentLoaded", () => {
    // renderer.js completes its normal lightweight init, but preload defers the
    // automatic browser creation. Clear the temporary selected profile state so
    // the first real user click opens it normally.
    setTimeout(async () => {
      try {
        const browserState = await window.pagebot.browser.state();
        if (!browserState?.url && typeof state !== "undefined") {
          state.activeProfile = null;
          state.browserSupportedChat = false;
          state.lastSuggestion = "";
          if (typeof renderProfiles === "function") renderProfiles();
          if (typeof renderAiPanel === "function") renderAiPanel();
          const url = document.querySelector("#url");
          if (url) url.value = "";
          if (typeof log === "function") log("Khởi động nhanh: chưa mở Facebook. Chọn profile bên trái khi cần dùng.", "success");
        }
      } catch {}
    }, 350);
  });
})();
