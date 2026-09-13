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

  function normalizeBase32(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/-/g, "")
      .replace(/=+$/g, "");
  }

  function decodeBase32(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const input = normalizeBase32(value);
    if (!input || /[^A-Z2-7]/.test(input)) throw new Error("Khóa 2FA không đúng định dạng Base32.");
    let bits = "";
    for (const char of input) {
      const index = alphabet.indexOf(char);
      if (index < 0) throw new Error("Khóa 2FA không đúng định dạng Base32.");
      bits += index.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
    if (!bytes.length) throw new Error("Khóa 2FA quá ngắn hoặc không hợp lệ.");
    return new Uint8Array(bytes);
  }

  async function generateTotp(secret, timestamp = Date.now()) {
    if (!globalThis.crypto?.subtle) throw new Error("Trình duyệt hiện tại không hỗ trợ tạo mã 2FA cục bộ.");
    const keyBytes = decodeBase32(secret);
    const counter = Math.floor(timestamp / 30000);
    const counterBytes = new Uint8Array(8);
    let value = BigInt(counter);
    for (let i = 7; i >= 0; i -= 1) {
      counterBytes[i] = Number(value & 0xffn);
      value >>= 8n;
    }
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
    const offset = signature[signature.length - 1] & 0x0f;
    const binary = ((signature[offset] & 0x7f) << 24)
      | ((signature[offset + 1] & 0xff) << 16)
      | ((signature[offset + 2] & 0xff) << 8)
      | (signature[offset + 3] & 0xff);
    return String(binary % 1000000).padStart(6, "0");
  }

  async function resolveTwoFactorCode(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    if (/^\d{6,8}$/.test(raw)) return raw;
    return generateTotp(raw);
  }

  function prepareTwoFactorField() {
    const input = q("#fb-login-2fa");
    if (!input) return;
    input.inputMode = "text";
    input.autocomplete = "off";
    input.placeholder = "Ví dụ: JBSWY3DPEHPK3PXP";
    input.maxLength = 128;
    const label = input.closest("label")?.querySelector("span");
    if (label) label.textContent = "Khóa 2FA / TOTP secret";

    const note = q(".facebook-login-note");
    if (note) {
      note.textContent = "Tài khoản + mật khẩu được mã hóa bằng Windows secure storage. Khóa 2FA chỉ dùng để tạo mã 6 số ngay trên máy khi bấm Đăng nhập và không được lưu.";
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
        ? "Tài khoản và mật khẩu được lưu mã hóa bằng Windows secure storage. Dán khóa 2FA/TOTP secret khi cần đăng nhập; app sẽ tự tạo mã 6 số hiện tại và không lưu khóa này."
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
      setResult("Đã lưu tài khoản + mật khẩu riêng cho profile này bằng Windows secure storage. Khóa 2FA không được lưu.", "ok");
    } catch (error) {
      setResult(error?.message || String(error), "warn");
    }
  }

  async function runLogin() {
    if (!activeProfileId) return;
    const account = q("#fb-login-account")?.value.trim() || "";
    const password = q("#fb-login-password")?.value || "";
    const twoFactorInput = q("#fb-login-2fa")?.value.trim() || "";
    const button = q("#run-fb-login");
    if (button) button.disabled = true;
    setResult("Đang chuẩn bị thông tin đăng nhập Facebook...");
    try {
      const twoFactorCode = await resolveTwoFactorCode(twoFactorInput);
      if (twoFactorInput && !/^\d{6,8}$/.test(twoFactorInput)) {
        setResult("Đã tạo mã 2FA 6 số từ khóa TOTP. Đang điền vào Facebook...");
      } else {
        setResult("Đang điền thông tin vào trang đăng nhập Facebook...");
      }

      const result = await window.pagebot.profileLogin.run(activeProfileId, { account, password, twoFactorCode });
      if (q("#fb-login-2fa")) q("#fb-login-2fa").value = "";

      if (result.stage === "two_factor_required") {
        setResult("Facebook đang yêu cầu 2FA. Dán khóa 2FA/TOTP secret vào ô trên rồi bấm Đăng nhập lại; app sẽ tự tạo mã 6 số hiện tại.", "warn");
      } else if (result.stage === "two_factor_submitted") {
        setResult("Đã tạo và gửi mã 2FA hiện tại. Chờ Facebook xác nhận; nếu có checkpoint/captcha thì hoàn tất trực tiếp trên màn hình.", "ok");
      } else if (result.stage === "credentials_submitted") {
        setResult("Đã gửi tài khoản và mật khẩu. Nếu Facebook chuyển sang bước 2FA, app sẽ dùng mã vừa tạo từ khóa TOTP nếu bước đó xuất hiện trong lần đăng nhập này.", "ok");
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
    prepareTwoFactorField();
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
