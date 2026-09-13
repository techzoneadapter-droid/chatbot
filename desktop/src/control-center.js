(() => {
  const ENGINES = {
    off: { label: "Tắt", detail: "Không có luồng Auto Chat nào chạy." },
    light: { label: "Auto nhẹ", detail: "Khuyến nghị · kiểm tra khoảng 6 giây/lần · ít tải Facebook." },
    legacy: { label: "Auto tương thích", detail: "Dùng khi Auto nhẹ bỏ sót tin hoặc không bắt được giao diện hiện tại · phản hồi nhanh hơn nhưng dùng tài nguyên nhiều hơn." }
  };

  window.__pagebotChatbotEngine = "off";

  function addStylesheet() {
    if (document.querySelector('link[data-pagebot-control-center="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "control-center.css";
    link.dataset.pagebotControlCenter = "1";
    document.head.appendChild(link);
  }

  function activityLog(text, level = "success") {
    if (typeof log === "function") log(text, level);
  }

  function getActiveProfile() {
    return typeof state !== "undefined" ? state.activeProfile : null;
  }

  function supportedChat() {
    return typeof state !== "undefined" && Boolean(state.browserSupportedChat);
  }

  function setEngineUi(mode) {
    document.querySelectorAll("[data-chatbot-engine]").forEach((button) => {
      const active = button.dataset.chatbotEngine === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const status = document.getElementById("chatbot-engine-status");
    if (status) {
      const info = ENGINES[mode] || ENGINES.off;
      status.innerHTML = `<strong>${info.label}</strong><span>${info.detail}</span>`;
      status.dataset.engine = mode;
    }
  }

  async function setEngine(mode, options = {}) {
    const requested = ENGINES[mode] ? mode : "off";
    let next = requested;

    if (next !== "off" && !getActiveProfile()) {
      activityLog("Hãy mở một profile trước khi bật Chatbot.", "warn");
      next = "off";
    }
    if (next !== "off" && !supportedChat()) {
      activityLog("Hãy mở Business Suite Inbox hoặc Messenger trước khi bật Chatbot.", "warn");
      next = "off";
    }

    window.__pagebotChatbotEngine = next;

    try {
      await window.pagebot.legacyAuto.setEnabled(next === "legacy");
    } catch (error) {
      activityLog(error?.message || String(error), "error");
      next = "off";
      window.__pagebotChatbotEngine = "off";
      try { await window.pagebot.legacyAuto.setEnabled(false); } catch {}
    }

    const toggle = document.getElementById("auto-reply");
    if (toggle) {
      toggle.checked = next !== "off";
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setEngineUi(next);
    window.dispatchEvent(new CustomEvent("pagebot:chatbot-engine-change", { detail: { engine: next } }));

    if (!options.quiet) {
      if (next === "light") activityLog("Đã bật Auto nhẹ. Không chạy Auto tương thích.", "success");
      else if (next === "legacy") activityLog("Đã bật Auto tương thích. Auto nhẹ đã dừng.", "warn");
      else activityLog("Chatbot tự động đã tắt hoàn toàn.", "success");
    }
  }

  function makeEngineCard() {
    const card = document.createElement("section");
    card.className = "card cc-engine-card";
    card.innerHTML = `
      <div class="section-head">
        <div>
          <strong>Chatbot tự động</strong>
          <small>Chỉ một chế độ được chạy tại một thời điểm</small>
        </div>
      </div>
      <div class="cc-engine-list">
        <button type="button" class="cc-engine-option active" data-chatbot-engine="off" aria-pressed="true">
          <span class="cc-engine-dot"></span><span><b>Tắt</b><small>Không quét tin nhắn nền</small></span>
        </button>
        <button type="button" class="cc-engine-option" data-chatbot-engine="light" aria-pressed="false">
          <span class="cc-engine-dot"></span><span><b>Auto nhẹ</b><small>Dùng bình thường · ít tài nguyên</small></span>
        </button>
        <button type="button" class="cc-engine-option" data-chatbot-engine="legacy" aria-pressed="false">
          <span class="cc-engine-dot"></span><span><b>Auto tương thích</b><small>Dùng khi Auto nhẹ bỏ sót hoặc không bắt được tin</small></span>
        </button>
      </div>
      <div id="chatbot-engine-status" class="cc-engine-status" data-engine="off">
        <strong>Tắt</strong><span>Không có luồng Auto Chat nào chạy.</span>
      </div>
      <p class="help"><b>Auto nhẹ</b> là chế độ mặc định. Chỉ chuyển sang <b>Auto tương thích</b> nếu Auto nhẹ bỏ sót tin hoặc không hoạt động ổn với giao diện Facebook hiện tại.</p>
    `;
    card.querySelectorAll("[data-chatbot-engine]").forEach((button) => {
      button.addEventListener("click", () => void setEngine(button.dataset.chatbotEngine));
    });
    return card;
  }

  function makeTokenCard() {
    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `
      <div class="section-head">
        <div>
          <strong>Access Token</strong>
          <small>Mở công cụ khi cần</small>
        </div>
      </div>
      <button id="cc-open-token" type="button" class="primary full">🔑 Mở Access Token</button>
    `;
    card.querySelector("#cc-open-token").addEventListener("click", async () => {
      if (!getActiveProfile()) {
        activityLog("Hãy mở một profile trước.", "warn");
        return;
      }
      try {
        await window.pagebot.browser.navigate("https://developers.facebook.com/tools/explorer/");
      } catch (error) {
        activityLog(error?.message || String(error), "error");
      }
    });
    return card;
  }

  function makeCookieCard(cookieButton) {
    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `
      <div class="section-head">
        <div>
          <strong>Cookie / Đăng nhập bằng Cookie</strong>
          <small>Chạy 100% local · không gửi ra server</small>
        </div>
      </div>
      <p class="help">Dán chuỗi cookie Facebook (dạng <code>c_user=...; xs=...; ...</code>) rồi bấm Import. App ghi cookie trực tiếp vào session của profile đang mở, không qua máy chủ nào khác.</p>
      <label>
        <span>Chuỗi cookie</span>
        <textarea id="cc-cookie-input" rows="5" spellcheck="false" autocomplete="off" placeholder="c_user=...; xs=...; fr=...; datr=..."></textarea>
      </label>
      <div class="button-row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <button id="cc-cookie-import" type="button" class="primary">Import &amp; Đăng nhập</button>
        <button id="cc-cookie-export" type="button" class="secondary">Export cookie hiện tại</button>
        <button id="cc-cookie-clear" type="button" class="ghost danger">Xóa cookie FB</button>
      </div>
      <p id="cc-cookie-status" class="help" style="margin-top:8px">Mở profile trước, rồi dán cookie để đăng nhập.</p>
      <hr style="margin:12px 0;border:none;border-top:1px solid #e5e7eb" />
      <p class="help">Tuỳ chọn: mở tool Cookie cũ (extension) nếu bạn quen dùng.</p>
    `;
    cookieButton.className = "secondary full cc-cookie-launch";
    cookieButton.textContent = "🍪 Mở tool Cookie (extension)";
    cookieButton.title = "Mở Get Cookie For FPlus";
    cookieButton.setAttribute("aria-label", "Mở tool Cookie extension");
    card.appendChild(cookieButton);

    const input = () => card.querySelector("#cc-cookie-input");
    const status = () => card.querySelector("#cc-cookie-status");
    const setStatus = (text, level = "") => {
      const el = status();
      if (!el) return;
      el.textContent = text;
      el.style.color = level === "error" ? "#b91c1c" : level === "ok" ? "#047857" : "";
    };

    card.querySelector("#cc-cookie-import")?.addEventListener("click", async () => {
      const profile = getActiveProfile();
      if (!profile?.id) return setStatus("Hãy mở một profile trước.", "error");
      const raw = (input()?.value || "").trim();
      if (!raw) return setStatus("Hãy dán chuỗi cookie trước.", "error");
      setStatus("Đang import cookie vào session local...");
      try {
        const result = await window.pagebot.cookieTool.import(profile.id, raw, { clearFirst: true });
        const warn = (result.warnings || []).join(" ");
        setStatus(
          `Đã import ${result.pairCount} cookie (c_user=${result.hasCUser ? "có" : "thiếu"}, xs=${result.hasXs ? "có" : "thiếu"}). Đã reload trang. ${warn}`.trim(),
          result.hasCUser && result.hasXs ? "ok" : "error"
        );
        activityLog(`Cookie import xong cho profile ${profile.name}.`, result.hasCUser && result.hasXs ? "success" : "warn");
      } catch (error) {
        setStatus(error?.message || String(error), "error");
        activityLog(error?.message || String(error), "error");
      }
    });

    card.querySelector("#cc-cookie-export")?.addEventListener("click", async () => {
      const profile = getActiveProfile();
      if (!profile?.id) return setStatus("Hãy mở một profile trước.", "error");
      try {
        const result = await window.pagebot.cookieTool.export(profile.id);
        if (input()) input().value = result.cookie || "";
        setStatus(
          result.hasSession
            ? `Đã lấy ${result.count} cookie (c_user=${result.c_user}). Đã dán vào ô trên.`
            : `Chỉ có ${result.count} cookie, chưa thấy session đăng nhập đầy đủ.`,
          result.hasSession ? "ok" : "error"
        );
        activityLog(`Đã export cookie profile ${profile.name}.`, "success");
      } catch (error) {
        setStatus(error?.message || String(error), "error");
      }
    });

    card.querySelector("#cc-cookie-clear")?.addEventListener("click", async () => {
      const profile = getActiveProfile();
      if (!profile?.id) return setStatus("Hãy mở một profile trước.", "error");
      if (!confirm("Xóa toàn bộ cookie Facebook của profile này và chuyển về trang đăng nhập?")) return;
      try {
        const result = await window.pagebot.cookieTool.clear(profile.id);
        if (input()) input().value = "";
        setStatus(`Đã xóa khoảng ${result.removed || 0} cookie Facebook của profile.`, "ok");
        activityLog(`Đã xóa cookie Facebook profile ${profile.name}.`, "success");
      } catch (error) {
        setStatus(error?.message || String(error), "error");
      }
    });

    return card;
  }

  function makeNav(items) {
    const nav = document.createElement("div");
    nav.className = "cc-nav";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cc-nav-button";
      button.dataset.ccTarget = item.id;
      button.innerHTML = `<span>${item.icon}</span><b>${item.label}</b>`;
      nav.appendChild(button);
    }
    return nav;
  }

  function initControlCenter() {
    if (document.body.dataset.controlCenterReady === "1") return;
    const scroll = document.querySelector(".ai-panel .panel-scroll");
    if (!scroll) return;

    const apiCard = document.getElementById("ai-provider")?.closest(".card");
    const proxyCard = document.getElementById("proxy-card");
    const loginCard = document.getElementById("facebook-login-card");
    const knowledgeCard = document.getElementById("knowledge")?.closest(".card");
    const chatCard = document.getElementById("suggest-reply")?.closest(".card");
    const activityCard = document.querySelector(".activity-card");
    const safetyNote = document.querySelector(".safety-note");
    const cookieButton = document.getElementById("cookie-tool");
    if (!apiCard || !proxyCard || !loginCard || !knowledgeCard || !chatCard || !activityCard || !cookieButton) return;

    document.body.dataset.controlCenterReady = "1";
    addStylesheet();

    const originalAutoLabel = document.querySelector(".auto-chat-switch");
    if (originalAutoLabel) originalAutoLabel.classList.add("cc-system-auto-toggle");

    const navItems = [
      { id: "chatbot", label: "Chatbot", icon: "🤖" },
      { id: "ai", label: "AI Chat", icon: "✦" },
      { id: "proxy", label: "Proxy", icon: "◉" },
      { id: "login", label: "Login FB", icon: "f" },
      { id: "token", label: "Access Token", icon: "🔑" },
      { id: "cookie", label: "Cookie", icon: "🍪" }
    ];
    const nav = makeNav(navItems);
    const content = document.createElement("div");
    content.className = "cc-content";

    const panes = {};
    for (const item of navItems) {
      const pane = document.createElement("div");
      pane.className = "cc-pane";
      pane.dataset.ccPane = item.id;
      panes[item.id] = pane;
      content.appendChild(pane);
    }

    panes.chatbot.appendChild(makeEngineCard());
    if (safetyNote) panes.chatbot.appendChild(safetyNote);

    panes.ai.appendChild(apiCard);
    panes.ai.appendChild(knowledgeCard);
    panes.ai.appendChild(chatCard);
    panes.proxy.appendChild(proxyCard);
    panes.login.appendChild(loginCard);
    panes.token.appendChild(makeTokenCard());
    panes.cookie.appendChild(makeCookieCard(cookieButton));

    const activityTitle = activityCard.querySelector(".section-head strong");
    const activitySmall = activityCard.querySelector(".section-head small");
    if (activityTitle) activityTitle.textContent = "Thông báo";
    if (activitySmall) activitySmall.textContent = "Trạng thái và lỗi của chức năng đang dùng";
    activityCard.classList.add("cc-activity");

    scroll.replaceChildren(nav, content, activityCard);
    scroll.classList.add("cc-control-center");

    function showPane(id) {
      Object.entries(panes).forEach(([key, pane]) => pane.classList.toggle("active", key === id));
      nav.querySelectorAll(".cc-nav-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.ccTarget === id);
      });
    }

    nav.querySelectorAll(".cc-nav-button").forEach((button) => {
      button.addEventListener("click", () => showPane(button.dataset.ccTarget));
    });
    showPane("chatbot");
    setEngineUi("off");

    window.pagebot.onEvent((event) => {
      if (!event) return;
      if (event.type === "active-profile") void setEngine("off", { quiet: true });
      if (event.type === "browser-state" && event.payload?.supportedChat === false && window.__pagebotChatbotEngine !== "off") {
        void setEngine("off", { quiet: true });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initControlCenter, { once: true });
  } else {
    initControlCenter();
  }
})();
