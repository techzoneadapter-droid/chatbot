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

  document.addEventListener("DOMContentLoaded", () => {
    const newProfile = get("new-profile");
    const cancel = get("cancel-profile");
    const form = get("profile-form");
    if (!newProfile || !cancel || !form) return;

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
  });
})();
