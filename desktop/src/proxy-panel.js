(() => {
  const q = (selector) => document.querySelector(selector);
  let activeProfileId = null;

  function setDisabled(disabled) {
    for (const id of ["proxy-enabled", "proxy-type", "proxy-host", "proxy-port", "proxy-username", "proxy-password", "save-proxy", "test-proxy", "disable-proxy"]) {
      const el = q(`#${id}`);
      if (el) el.disabled = disabled;
    }
  }

  function setResult(message = "", kind = "") {
    const result = q("#proxy-result");
    if (!result) return;
    result.textContent = message;
    result.classList.toggle("hidden", !message);
    result.classList.remove("proxy-result-error", "proxy-result-success", "proxy-result-info", "muted", "warn", "ok");
    if (!message) return;
    if (kind === "error") result.classList.add("proxy-result-error");
    else if (kind === "success") result.classList.add("proxy-result-success");
    else result.classList.add("proxy-result-info");
  }

  function setStatus(proxy, status = "normal") {
    const indicator = q("#proxy-status");
    if (!indicator) return;

    // The indicator is deliberately silent while proxy is OFF. No "direct"
    // label is shown: the switch itself is enough to communicate the disabled state.
    indicator.textContent = "";
    indicator.className = "proxy-indicator";
    indicator.removeAttribute("aria-label");
    indicator.removeAttribute("title");

    if (!proxy?.enabled) {
      indicator.classList.add("hidden");
      return;
    }

    indicator.classList.remove("hidden");
    indicator.classList.add("active");
    if (status === "error") indicator.classList.add("error");
    indicator.title = status === "error" ? "Proxy đang bật nhưng vừa gặp lỗi" : "Proxy đang bật";
    indicator.setAttribute("aria-label", indicator.title);
  }

  async function loadProxy(profileId) {
    activeProfileId = profileId || null;
    if (!activeProfileId) {
      setDisabled(true);
      if (q("#proxy-enabled")) q("#proxy-enabled").checked = false;
      setStatus(null);
      setResult();
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
      setResult();
    } catch (error) {
      setStatus(null);
      setResult(`Lỗi tải cấu hình proxy: ${error?.message || String(error)}`, "error");
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
    const wantsEnabled = q("#proxy-enabled").checked;
    setResult(wantsEnabled ? "Đang bật và áp dụng proxy..." : "Đang lưu cấu hình proxy...", "info");
    try {
      const proxy = await window.pagebot.proxy.save(activeProfileId, currentConfig());
      setStatus(proxy);
      q("#proxy-password").value = "";
      q("#proxy-password").placeholder = proxy.hasPassword ? "Đã lưu mật khẩu · để trống để giữ nguyên" : "Mật khẩu proxy (nếu có)";
      if (proxy.enabled) {
        await window.pagebot.browser.reload();
        setResult();
      } else {
        setResult();
      }
    } catch (error) {
      setStatus({ enabled: wantsEnabled }, "error");
      setResult(`Lỗi proxy: ${error?.message || String(error)}`, "error");
    }
  }

  async function testProxy() {
    if (!activeProfileId) return;
    if (!q("#proxy-enabled").checked) {
      setResult("Proxy đang tắt. Bật Dùng proxy và bấm Lưu & áp dụng trước khi kiểm tra.", "info");
      return;
    }

    setResult("Đang kiểm tra proxy...", "info");
    try {
      const result = await window.pagebot.proxy.test(activeProfileId);
      if (result.direct) {
        setStatus(null);
        setResult("Proxy chưa được áp dụng. Bấm Lưu & áp dụng rồi kiểm tra lại.", "error");
      } else {
        setStatus({ enabled: true });
        setResult(`Proxy hoạt động · IP ra ngoài: ${result.ip || "không đọc được"}`, "success");
      }
    } catch (error) {
      setStatus({ enabled: true }, "error");
      setResult(`Lỗi kiểm tra proxy: ${error?.message || String(error)}`, "error");
    }
  }

  async function disableProxy() {
    if (!activeProfileId) return;
    try {
      const proxy = await window.pagebot.proxy.disable(activeProfileId);
      q("#proxy-enabled").checked = false;
      setStatus(proxy);
      await window.pagebot.browser.reload();
      setResult();
    } catch (error) {
      setResult(`Lỗi khi tắt proxy: ${error?.message || String(error)}`, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setDisabled(true);
    if (q("#proxy-enabled")) q("#proxy-enabled").checked = false;
    setStatus(null);
    setResult();
    q("#save-proxy")?.addEventListener("click", () => void saveProxy());
    q("#test-proxy")?.addEventListener("click", () => void testProxy());
    q("#disable-proxy")?.addEventListener("click", () => void disableProxy());

    // Event-driven only: no polling timer in the background.
    window.pagebot.onEvent((event) => {
      if (event?.type === "active-profile" && event.payload?.id) void loadProxy(event.payload.id);
    });
  });
})();
