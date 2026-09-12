(() => {
  const q = (selector) => document.querySelector(selector);
  let activeProfileId = null;
  let savedLogin = { account: "", hasPassword: false, secureStorage: false };

  function setDisabled(disabled) {
    for (const id of ["fb-login-account", "fb-login-password", "fb-login-2fa", "save-fb-login", "run-fb-login", "clear-fb-login"]) {
      const el = q(`#${id}`);
      if (el) el.disabled = disabled;
    }
  }

  function setResult(text, type = "muted") {
    const result = q("#fb-login-result");
    if (!result) return;
    result.textContent = text;
    result.className = `diagnostics ${type}`;
  }

  function showStoredState() {
    const badge = q("#fb-login-status");
    if (!badge) return;
    if (!activeProfileId) {
      badge.textContent = "Chưa mở profile";
      badge.className = "status-badge warn";
      return;
    }
    if (savedLogin.account && savedLogin.hasPassword) {
      badge.textContent = "Đã lưu bảo mật";
      badge.className = "status-badge ok";
    } else {
      badge.textContent = "Chưa lưu đăng nhập";
      badge.className = "status-badge warn";
    }
  }

  async function loadLogin(profileId) {
    activeProfileId = profileId || null;
    const account = q("#fb-login-account");
    const password = q("#fb-login-password");
    const code = q("#fb-login-2fa");
    if (!activeProfileId) {
      savedLogin = { account: "", hasPassword: false, secureStorage: false };
      setDisabled(true);
      if (account) account.value = "";
      if (password) password.value = "";
      if (code) code.value = "";
      showStoredState();
      setResult("Mở một profile để cấu hình đăng nhập Facebook.");
      return;
    }

    setDisabled(false);
    try {
      savedLogin = await window.pagebot.profileLogin.get(activeProfileId);
      if (account) account.value = savedLogin.account || "";
      if (password) {
        password.value = "";
        password.placeholder = savedLogin.hasPassword ? "Đã lưu bằng Windows secure storage · để trống để giữ nguyên" : "Mật khẩu Facebook";
      }
      if (code) code.value = "";
      showStoredState();
      setResult(savedLogin.secureStorage
        ? "Tài khoản và mật khẩu được lưu mã hóa bằng Windows secure storage. Mã 2FA chỉ dùng một lần và không được lưu."
        : "Windows secure storage chưa sẵn sàng trên máy này.",
      savedLogin.secureStorage ? "muted" : "warn");
    } catch (error) {
      setResult(error?.message || String(error), "warn");
    }
  }

  async function saveLogin() {
    if (!activeProfileId) return;
    const account = q("#fb-login-account")?.value.trim() || "";
    const password = q("#fb-login-password")?.value || "";
    setResult("Đang lưu thông tin đăng nhập...");
    try {
      savedLogin = await window.pagebot.profileLogin.save(activeProfileId, { account, password });
      if (q("#fb-login-password")) {
        q("#fb-login-password").value = "";
        q("#fb-login-password").placeholder = "Đã lưu bằng Windows secure storage · để trống để giữ nguyên";
      }
      showStoredState();
      setResult("Đã lưu tài khoản + mật khẩu riêng cho profile này bằng Windows secure storage.", "ok");
    } catch (error) {
      setResult(error?.message || String(error), "warn");
    }
  }

  async function runLogin() {
    if (!activeProfileId) return;
    const account = q("#fb-login-account")?.value.trim() || "";
    const password = q("#fb-login-password")?.value || "";
    const twoFactorCode = q("#fb-login-2fa")?.value.trim() || "";
    const button = q("#run-fb-login");
    if (button) button.disabled = true;
    setResult("Đang điền thông tin vào trang đăng nhập Facebook...");
    try {
      const result = await window.pagebot.profileLogin.run(activeProfileId, { account, password, twoFactorCode });
      if (q("#fb-login-2fa")) q("#fb-login-2fa").value = "";

      if (result.stage === "two_factor_required") {
        setResult("Facebook đang yêu cầu mã 2FA. Nhập mã hiện tại vào ô Mã 2FA rồi bấm Đăng nhập lại. Mã này không được lưu.", "warn");
      } else if (result.stage === "two_factor_submitted") {
        setResult("Đã gửi mã 2FA. Chờ Facebook xác nhận; nếu có checkpoint/captcha thì hoàn tất trực tiếp trên màn hình.", "ok");
      } else if (result.stage === "credentials_submitted") {
        setResult("Đã gửi tài khoản và mật khẩu. Nếu Facebook yêu cầu 2FA/captcha, app sẽ để bạn xử lý bước xác minh tiếp theo.", "ok");
      } else if (result.stage === "no_login_form") {
        setResult("Không thấy form đăng nhập. Có thể profile đã đăng nhập hoặc Facebook đang ở bước xác minh khác.", "ok");
      } else {
        setResult("Facebook đang yêu cầu thao tác xác minh thủ công. Hãy hoàn tất bước đang hiển thị trên màn hình.", "warn");
      }
    } catch (error) {
      setResult(error?.message || String(error), "warn");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function clearLogin() {
    if (!activeProfileId) return;
    if (!confirm("Xóa tài khoản và mật khẩu Facebook đã lưu của profile này?")) return;
    try {
      await window.pagebot.profileLogin.clear(activeProfileId);
      savedLogin = { account: "", hasPassword: false, secureStorage: savedLogin.secureStorage };
      if (q("#fb-login-account")) q("#fb-login-account").value = "";
      if (q("#fb-login-password")) {
        q("#fb-login-password").value = "";
        q("#fb-login-password").placeholder = "Mật khẩu Facebook";
      }
      if (q("#fb-login-2fa")) q("#fb-login-2fa").value = "";
      showStoredState();
      setResult("Đã xóa thông tin đăng nhập đã lưu.", "ok");
    } catch (error) {
      setResult(error?.message || String(error), "warn");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setDisabled(true);
    showStoredState();
    q("#save-fb-login")?.addEventListener("click", () => void saveLogin());
    q("#run-fb-login")?.addEventListener("click", () => void runLogin());
    q("#clear-fb-login")?.addEventListener("click", () => void clearLogin());

    window.pagebot.onEvent((event) => {
      if (event?.type === "active-profile" && event.payload?.id) void loadLogin(event.payload.id);
    });
  });
})();
