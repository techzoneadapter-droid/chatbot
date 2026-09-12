(() => {
  const valuesByProfile = new Map();

  function activeProfileId() {
    return typeof state !== "undefined" ? state.activeProfile?.id || "" : "";
  }

  function writeLog(text, level = "info") {
    if (typeof log === "function") log(text, level);
  }

  async function copyText(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }

  function render() {
    const pane = document.querySelector('[data-cc-pane="token"]');
    if (!pane || pane.dataset.manualTokenReady === "1") return false;
    pane.dataset.manualTokenReady = "1";
    pane.innerHTML = `
      <section class="card">
        <div class="section-head">
          <div>
            <strong>Access Token</strong>
            <small>Hiển thị nhanh token của profile đang dùng</small>
          </div>
        </div>
        <label>
          <span>Token</span>
          <textarea id="cc-access-token-value" rows="5" spellcheck="false" autocomplete="off" placeholder="Dán Access Token của bạn vào đây..."></textarea>
        </label>
        <p class="help">PageBot không tự đọc token từ cookie/session. Token bạn dán chỉ được giữ trong phiên app hiện tại.</p>
        <div class="button-row">
          <button id="cc-token-remember" type="button" class="secondary">Giữ trong phiên</button>
          <button id="cc-token-copy" type="button" class="ghost">Sao chép</button>
          <button id="cc-token-clear" type="button" class="ghost danger">Xóa</button>
        </div>
        <button id="cc-open-token" type="button" class="ghost full">🔑 Mở Graph API Explorer</button>
      </section>
    `;

    const input = pane.querySelector("#cc-access-token-value");
    const loadCurrent = () => {
      input.value = valuesByProfile.get(activeProfileId()) || "";
    };

    pane.querySelector("#cc-token-remember")?.addEventListener("click", () => {
      const profileId = activeProfileId();
      if (!profileId) return writeLog("Hãy mở một profile trước.", "warn");
      const value = input.value.trim();
      if (!value) return writeLog("Hãy dán Access Token trước.", "warn");
      valuesByProfile.set(profileId, value);
      writeLog("Đã giữ Access Token trong phiên hiện tại của profile.", "success");
    });

    pane.querySelector("#cc-token-copy")?.addEventListener("click", async () => {
      const ok = await copyText(input.value);
      writeLog(ok ? "Đã sao chép Access Token." : "Chưa có Access Token để sao chép.", ok ? "success" : "warn");
    });

    pane.querySelector("#cc-token-clear")?.addEventListener("click", () => {
      const profileId = activeProfileId();
      if (profileId) valuesByProfile.delete(profileId);
      input.value = "";
      writeLog("Đã xóa Access Token khỏi phiên hiện tại.", "success");
    });

    pane.querySelector("#cc-open-token")?.addEventListener("click", async () => {
      if (!activeProfileId()) return writeLog("Hãy mở một profile trước.", "warn");
      try {
        await window.pagebot.browser.navigate("https://developers.facebook.com/tools/explorer/");
      } catch (error) {
        writeLog(error?.message || String(error), "error");
      }
    });

    window.pagebot.onEvent((event) => {
      if (event?.type === "active-profile") loadCurrent();
    });
    loadCurrent();
    return true;
  }

  function install() {
    if (render()) return;
    const observer = new MutationObserver(() => {
      if (render()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
