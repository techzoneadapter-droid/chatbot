(() => {
  const q = (selector) => document.querySelector(selector);

  function injectStyles() {
    if (q("#pagebot-profile-delete-style")) return;
    const style = document.createElement("style");
    style.id = "pagebot-profile-delete-style";
    style.textContent = `
      #delete-profile{display:none!important}
      .profile-row{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:4px;align-items:stretch}
      .profile-row .profile-card{min-width:0;height:100%}
      .profile-delete-inline{border:1px solid transparent;background:transparent;color:#a7afbc;border-radius:9px;font-size:15px;display:grid;place-items:center;padding:0;transition:.15s ease}
      .profile-row:hover .profile-delete-inline{color:#d63c4d;background:#fff6f7;border-color:#f1d4d8}
      .profile-delete-inline:hover{background:#ffecef!important;border-color:#edbcc3!important;color:#c72e41!important}
    `;
    document.head.appendChild(style);
  }

  async function deleteProfile(profileId) {
    if (!profileId) return;
    const profile = Array.isArray(state?.profiles) ? state.profiles.find((item) => item.id === profileId) : null;
    if (!profile) return;
    if (!confirm(`Xóa profile “${profile.name}”? Dữ liệu đăng nhập của profile này cũng sẽ bị xóa.`)) return;

    if (typeof setBusy === "function") setBusy(true, "Đang xóa profile...");
    try {
      const wasActive = state?.activeProfile?.id === profileId;
      await window.pagebot.profiles.delete(profileId);
      if (wasActive) {
        state.activeProfile = null;
        state.lastSuggestion = "";
        state.browserSupportedChat = false;
      }
      if (typeof loadProfiles === "function") await loadProfiles();
      if (typeof renderProfiles === "function") renderProfiles();
      if (wasActive && typeof renderAiPanel === "function") renderAiPanel();
      if (wasActive && q("#url")) q("#url").value = "";
      if (typeof log === "function") log(`Đã xóa ${profile.name}.`, "success");
      if (wasActive && state.profiles.length && typeof openProfile === "function") await openProfile(state.profiles[0].id);
    } catch (error) {
      if (typeof log === "function") log(typeof errorText === "function" ? errorText(error) : (error?.message || String(error)), "error");
    } finally {
      if (typeof setBusy === "function") setBusy(false);
    }
  }

  function decorate() {
    const container = q("#profiles");
    if (!container) return;
    Array.from(container.querySelectorAll(".profile-card")).forEach((card) => {
      if (card.closest(".profile-row")) return;
      const id = card.dataset.id;
      const row = document.createElement("div");
      row.className = "profile-row";
      card.parentNode.insertBefore(row, card);
      row.appendChild(card);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "profile-delete-inline";
      remove.dataset.profileId = id || "";
      remove.title = "Xóa profile này";
      remove.setAttribute("aria-label", "Xóa profile này");
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteProfile(remove.dataset.profileId);
      });
      row.appendChild(remove);
    });
  }

  function boot() {
    injectStyles();
    decorate();
    const container = q("#profiles");
    if (!container) return;
    const observer = new MutationObserver(decorate);
    observer.observe(container, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
