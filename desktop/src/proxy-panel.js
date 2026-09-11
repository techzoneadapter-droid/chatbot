(() => {
  const q = (selector) => document.querySelector(selector);
  let activeProfileId = null;

  function setDisabled(disabled) {
    for (const id of ["proxy-enabled", "proxy-type", "proxy-host", "proxy-port", "proxy-username", "proxy-password", "save-proxy", "test-proxy", "disable-proxy"]) {
      const el = q(`#${id}`);
      if (el) el.disabled = disabled;
    }
  }

  function setStatus(proxy) {
    const badge = q("#proxy-status");
    const result = q("#proxy-result");
    if (!badge) return;
    if (!proxy?.enabled) {
      badge.textContent = "Kết nối trực tiếp";
      badge.className = "status-badge ok";
      if (result) result.textContent = "Profile này hiện không dùng proxy.";
      return;
    }
    badge.textContent = `${proxy.type === "socks5" ? "SOCKS5" : "HTTP/HTTPS"} proxy đang bật`;
    badge.className = "status-badge warn";
    if (result) {
      const auth = proxy.username ? ` · user ${proxy.username}${proxy.hasPassword ? " · có mật khẩu" : ""}` : "";
      result.textContent = `${proxy.host}:${proxy.port}${auth}`;
    }
  }

  async function loadProxy(profileId) {
    activeProfileId = profileId || null;
    if (!activeProfileId) {
      setDisabled(true);
      setStatus(null);
      return;
    }
    setDisabled(false);
    try {
      const proxy = await window.pagebot.proxy.get(activeProfileId);
      q("#proxy-enabled").checked = Boolean(proxy.enabled);
      q("#proxy-type").value = proxy.type || "http";
      q("#proxy-host").value = proxy.host || "";
      q("#proxy-port").value = proxy.port || "";
      q("#proxy-username").value = proxy.username || "";
      q("#proxy-password").value = "";
      q("#proxy-password").placeholder = proxy.hasPassword ? "Đã lưu mật khẩu · để trống để giữ nguyên" : "Mật khẩu proxy (nếu có)";
      setStatus(proxy);
    } catch (error) {
      q("#proxy-result").textContent = error?.message || String(error);
    }
  }

  function currentConfig() {
    return {
      enabled: q("#proxy-enabled").checked,
      type: q("#proxy-type").value,
      host: q("#proxy-host").value.trim(),
      port: q("#proxy-port").value.trim(),
      username: q("#proxy-username").value.trim(),
      password: q("#proxy-password").value
    };
  }

  async function saveProxy() {
    if (!activeProfileId) return;
    q("#proxy-result").textContent = "Đang lưu và áp dụng proxy...";
    try {
      const proxy = await window.pagebot.proxy.save(activeProfileId, currentConfig());
      setStatus(proxy);
      q("#proxy-password").value = "";
      q("#proxy-password").placeholder = proxy.hasPassword ? "Đã lưu mật khẩu · để trống để giữ nguyên" : "Mật khẩu proxy (nếu có)";
      await window.pagebot.browser.reload();
      q("#proxy-result").textContent = proxy.enabled
        ? `Đã áp dụng ${proxy.type === "socks5" ? "SOCKS5" : "HTTP/HTTPS"} ${proxy.host}:${proxy.port} và tải lại profile.`
        : "Đã tắt proxy và tải lại profile bằng kết nối trực tiếp.";
    } catch (error) {
      q("#proxy-result").textContent = error?.message || String(error);
    }
  }

  async function testProxy() {
    if (!activeProfileId) return;
    q("#proxy-result").textContent = "Đang kiểm tra proxy...";
    try {
      const result = await window.pagebot.proxy.test(activeProfileId);
      if (result.direct) {
        q("#proxy-result").textContent = "Profile đang dùng kết nối trực tiếp (DIRECT).";
      } else {
        q("#proxy-result").textContent = `Proxy hoạt động · IP ra ngoài: ${result.ip || "không đọc được"} · ${result.resolvedProxy || ""}`;
      }
    } catch (error) {
      q("#proxy-result").textContent = `Kiểm tra thất bại: ${error?.message || String(error)}`;
    }
  }

  async function disableProxy() {
    if (!activeProfileId) return;
    try {
      const proxy = await window.pagebot.proxy.disable(activeProfileId);
      q("#proxy-enabled").checked = false;
      setStatus(proxy);
      await window.pagebot.browser.reload();
      q("#proxy-result").textContent = "Đã tắt proxy cho profile này.";
    } catch (error) {
      q("#proxy-result").textContent = error?.message || String(error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setDisabled(true);
    q("#save-proxy")?.addEventListener("click", () => void saveProxy());
    q("#test-proxy")?.addEventListener("click", () => void testProxy());
    q("#disable-proxy")?.addEventListener("click", () => void disableProxy());

    window.pagebot.onEvent((event) => {
      if (event?.type === "active-profile" && event.payload?.id) void loadProxy(event.payload.id);
    });

    setInterval(() => {
      try {
        const profileId = typeof state !== "undefined" ? state.activeProfile?.id : null;
        if (profileId !== activeProfileId) void loadProxy(profileId || null);
      } catch {}
    }, 1200);
  });
})();
