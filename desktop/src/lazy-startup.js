(() => {
  // renderer.js automatically opens the first saved profile during init. For fast
  // startup we suppress only that first automatic open, then restore the real
  // function so a user click opens the browser normally.
  const realOpen = window.pagebot?.profiles?.open;
  if (typeof realOpen !== "function") return;

  let suppressFirstOpen = true;
  window.pagebot.profiles.open = async (profileId) => {
    if (!suppressFirstOpen) return realOpen(profileId);
    suppressFirstOpen = false;
    const profiles = await window.pagebot.profiles.list();
    return profiles.find((profile) => profile.id === profileId) || null;
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      window.pagebot.profiles.open = realOpen;
      try {
        const browserWasNotCreated = !document.querySelector("#url")?.value;
        if (browserWasNotCreated && typeof state !== "undefined") {
          state.activeProfile = null;
          state.browserSupportedChat = false;
          state.lastSuggestion = "";
          if (typeof renderProfiles === "function") renderProfiles();
          if (typeof renderAiPanel === "function") renderAiPanel();
        }
        if (typeof log === "function") log("Khởi động nhanh: chưa mở Facebook. Chọn profile bên trái khi cần dùng.", "success");
      } catch {}
    }, 60);
  });
})();
