(() => {
  function get(id) {
    return document.getElementById(id);
  }

  function setCreatorOpen(open) {
    const form = get("profile-form");
    const button = get("new-profile");
    if (!form || !button) return;
    form.classList.toggle("hidden", !open);
    button.classList.toggle("active", open);
    button.textContent = open ? "− Đóng tạo profile" : "+ Tạo profile trình duyệt";
    if (open) {
      requestAnimationFrame(() => get("profile-name")?.focus());
    }
  }

  function showError(error) {
    const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error));
    if (typeof log === "function") log(text, "error");
    else alert(text);
  }

  function injectOmniboxStyles() {
    if (document.getElementById("pagebot-omnibox-styles")) return;
    const style = document.createElement("style");
    style.id = "pagebot-omnibox-styles";
    style.textContent = `
      .browser-bar {
        gap: 8px !important;
        padding: 7px 10px !important;
        background: rgba(255,255,255,.97) !important;
        backdrop-filter: blur(12px);
      }
      .nav-buttons { gap: 4px !important; }
      .nav-buttons button {
        width: 36px !important;
        height: 36px !important;
        border: 1px solid transparent !important;
        background: transparent !important;
        border-radius: 10px !important;
        color: #4b586c !important;
        font-size: 16px !important;
        transition: background .14s ease, border-color .14s ease, transform .14s ease;
      }
      .nav-buttons button:hover {
        background: #eef3f8 !important;
        border-color: #dce4ed !important;
      }
      .nav-buttons button:active { transform: scale(.95); }
      .url-form.omnibox {
        position: relative;
        flex: 1;
        height: 40px;
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 260px;
        padding: 3px 4px 3px 5px;
        border: 1px solid #d7dfe9;
        border-radius: 13px;
        background: #f5f8fb;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.75), 0 2px 8px rgba(40,57,80,.04);
        transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
      }
      .url-form.omnibox:focus-within {
        border-color: #7da6df;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(43,110,203,.10), 0 4px 14px rgba(40,57,80,.06);
      }
      .url-form.omnibox #url {
        flex: 1;
        min-width: 0;
        height: 32px !important;
        padding: 0 7px !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #1e293b !important;
        font-size: 12.5px !important;
      }
      .url-form.omnibox #url::placeholder { color: #8d99aa; }
      .omnibox-site {
        height: 30px;
        max-width: 148px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
        padding: 0 9px;
        border: 0;
        border-radius: 9px;
        background: #eaf1f8;
        color: #40516a;
        font-size: 10.5px;
        font-weight: 700;
      }
      .omnibox-site:hover { background: #e1eaf4; }
      .omnibox-site .site-icon { font-size: 11px; }
      .omnibox-site .site-host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .omnibox-action {
        width: 30px;
        height: 30px;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: #64748b;
        font-size: 16px;
      }
      .omnibox-action:hover { background: #e8eef5; color: #334155; }
      .omnibox-action.go {
        background: #e8f0fd;
        color: #2867c7;
        font-size: 15px;
      }
      .omnibox-action.go:hover { background: #dce9fb; }
      .omnibox-action.hidden-action { visibility: hidden; pointer-events: none; }
      .browser-shortcuts {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
      }
      .browser-shortcut {
        height: 34px;
        min-width: 34px;
        padding: 0 9px;
        border: 1px solid #dde5ee;
        border-radius: 10px;
        background: #fff;
        color: #526176;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .01em;
      }
      .browser-shortcut:hover { background: #f1f5f9; border-color: #cfd9e5; }
      .browser-shortcut.facebook { color: #1877f2; }
      .browser-shortcut.business { color: #6b4de6; }
      .browser-shortcut.messenger { color: #0a7cff; }
      .browser-loading {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 2px !important;
        border-radius: 0 !important;
        opacity: 0;
        transform: scaleX(.08);
        transform-origin: left center;
        background: linear-gradient(90deg, #1877f2, #8b5cf6, #ef5d6d) !important;
        box-shadow: none !important;
        transition: opacity .15s ease;
      }
      .browser-loading.visible {
        opacity: 1 !important;
        animation: pagebot-loading 1.1s ease-in-out infinite alternate;
      }
      @keyframes pagebot-loading {
        from { transform: scaleX(.12); }
        to { transform: scaleX(.88); }
      }
      @media (max-width: 1320px) {
        .browser-shortcut span { display: none; }
        .browser-shortcut { min-width: 32px; padding: 0 7px; }
        .omnibox-site { max-width: 95px; }
      }
    `;
    document.head.appendChild(style);
  }

  function hostInfo(url) {
    try {
      const parsed = new URL(url);
      const secure = parsed.protocol === "https:";
      const host = parsed.hostname.replace(/^www\./, "");
      if (/google\./i.test(host) && parsed.pathname.startsWith("/search")) {
        return { icon: "⌕", text: "Google", title: "Tìm kiếm Google" };
      }
      return {
        icon: secure ? "▣" : "!",
        text: host || "Trang web",
        title: secure ? `Kết nối HTTPS · ${host}` : `Kết nối chưa mã hóa · ${host}`
      };
    } catch {
      return { icon: "⌕", text: "Tìm kiếm", title: "Nhập từ khóa hoặc địa chỉ web" };
    }
  }

  function updateOmniboxSite(url) {
    const site = get("omnibox-site");
    if (!site) return;
    const info = hostInfo(url || get("url")?.value || "");
    const icon = site.querySelector(".site-icon");
    const host = site.querySelector(".site-host");
    if (icon) icon.textContent = info.icon;
    if (host) host.textContent = info.text;
    site.title = info.title;
  }

  function installOmnibox() {
    const form = get("url-form");
    const input = get("url");
    const bar = document.querySelector(".browser-bar");
    if (!form || !input || !bar || get("omnibox-site")) return;

    injectOmniboxStyles();
    form.classList.add("omnibox");
    input.placeholder = "Tìm kiếm Google hoặc nhập địa chỉ";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Tìm kiếm hoặc nhập địa chỉ web");

    const site = document.createElement("button");
    site.id = "omnibox-site";
    site.type = "button";
    site.className = "omnibox-site";
    site.innerHTML = '<span class="site-icon">▣</span><span class="site-host">Trang web</span>';
    site.addEventListener("click", () => {
      input.focus();
      input.select();
    });

    const clear = document.createElement("button");
    clear.id = "omnibox-clear";
    clear.type = "button";
    clear.className = "omnibox-action hidden-action";
    clear.textContent = "×";
    clear.title = "Xóa";
    clear.addEventListener("click", () => {
      input.value = "";
      clear.classList.add("hidden-action");
      input.focus();
      updateOmniboxSite("");
    });

    const go = document.createElement("button");
    go.id = "omnibox-go";
    go.type = "submit";
    go.className = "omnibox-action go";
    go.textContent = "→";
    go.title = "Đi tới / Tìm kiếm";

    form.insertBefore(site, input);
    form.appendChild(clear);
    form.appendChild(go);

    const shortcuts = document.createElement("div");
    shortcuts.className = "browser-shortcuts";
    shortcuts.innerHTML = `
      <button type="button" class="browser-shortcut facebook" data-url="https://www.facebook.com/" title="Facebook">f <span>FB</span></button>
      <button type="button" class="browser-shortcut business" data-url="https://business.facebook.com/latest/inbox" title="Business Suite Inbox">B <span>Suite</span></button>
      <button type="button" class="browser-shortcut messenger" data-url="https://www.messenger.com/" title="Messenger">M <span>Chat</span></button>
    `;
    const loading = get("browser-loading");
    bar.insertBefore(shortcuts, loading || null);
    shortcuts.querySelectorAll("[data-url]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await window.pagebot.browser.navigate(button.dataset.url);
        } catch (error) {
          showError(error);
        }
      });
    });

    const refreshClearState = () => clear.classList.toggle("hidden-action", !input.value);
    input.addEventListener("input", () => {
      refreshClearState();
      if (document.activeElement === input) updateOmniboxSite(input.value);
    });
    input.addEventListener("focus", () => {
      requestAnimationFrame(() => input.select());
      refreshClearState();
    });
    input.addEventListener("blur", () => updateOmniboxSite(input.value));

    document.addEventListener("keydown", (event) => {
      const focusAddress = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "l" || event.key.toLowerCase() === "k");
      if (!focusAddress && event.key !== "F6") return;
      event.preventDefault();
      input.focus();
      input.select();
    });

    window.pagebot.onEvent((event) => {
      if (event?.type !== "browser-state") return;
      if (event.payload?.url) {
        updateOmniboxSite(event.payload.url);
        refreshClearState();
      }
    });

    updateOmniboxSite(input.value);
    refreshClearState();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const newProfile = get("new-profile");
    const cancel = get("cancel-profile");
    const form = get("profile-form");
    if (newProfile && cancel && form) {
      newProfile.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCreatorOpen(form.classList.contains("hidden"));
      }, true);

      cancel.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCreatorOpen(false);
      }, true);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const submit = get("create-profile-submit");
        const data = new FormData(form);
        const name = String(data.get("name") || "").trim();
        const startUrl = String(data.get("startUrl") || "").trim();
        if (!name) {
          get("profile-name")?.focus();
          return;
        }

        if (submit) submit.disabled = true;
        if (typeof setBusy === "function") setBusy(true, "Đang tạo profile...");
        try {
          const profile = await window.pagebot.profiles.create({ name, startUrl });
          if (!profile?.id) throw new Error("Không tạo được profile mới.");
          form.reset();
          const startInput = form.querySelector('[name="startUrl"]');
          if (startInput) startInput.value = "https://business.facebook.com/latest/inbox";
          setCreatorOpen(false);
          if (typeof loadProfiles === "function") await loadProfiles();
          if (typeof renderProfiles === "function") renderProfiles();
          if (typeof openProfile === "function") await openProfile(profile.id);
        } catch (error) {
          showError(error);
        } finally {
          if (submit) submit.disabled = false;
          if (typeof setBusy === "function") setBusy(false);
        }
      }, true);
    }

    installOmnibox();
  });
})();
