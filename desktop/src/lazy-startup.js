(() => {
  document.addEventListener("DOMContentLoaded", () => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const browserState = await window.pagebot.browser.state();
        const hasTemporarySelection = typeof state !== "undefined" && Boolean(state.activeProfile);
        if (!browserState?.url && hasTemporarySelection) {
          state.activeProfile = null;
          state.browserSupportedChat = false;
          state.lastSuggestion = "";
          if (typeof renderProfiles === "function") renderProfiles();
          if (typeof renderAiPanel === "function") renderAiPanel();
          const url = document.querySelector("#url");
          if (url) url.value = "";
          if (typeof log === "function") log("Khởi động nhanh: chưa mở Facebook. Chọn profile bên trái khi cần dùng.", "success");
          clearInterval(timer);
          return;
        }
      } catch {}
      if (attempts >= 20) clearInterval(timer);
    }, 100);
  });
})();
