(() => {
  const q = (selector) => document.querySelector(selector);
  const PURPOSES = {
    consult: "Ưu tiên hiểu đúng nhu cầu và tư vấn chính xác trước khi chuyển sang bước tiếp theo.",
    zalo: "Khi phù hợp, hướng cuộc trò chuyện sang Zalo để tiếp tục tư vấn; không nhắc lặp nếu khách chưa muốn.",
    close: "Khi đã đủ thông tin, hướng cuộc trò chuyện tới bước chốt đơn tự nhiên; không gây áp lực.",
    "zalo-close": "Khi phù hợp, chuyển cuộc trò chuyện sang Zalo rồi hướng tới bước chốt đơn."
  };

  function purposeFromPrompt(prompt) {
    const match = String(prompt || "").match(/\[PAGEBOT_PURPOSE:([a-z-]+)\]/i);
    return match && PURPOSES[match[1]] ? match[1] : "consult";
  }

  function qualityBlock(value) {
    const purpose = PURPOSES[value] || PURPOSES.consult;
    return `[PAGEBOT_QUALITY]\n[PAGEBOT_PURPOSE:${value}]\n${purpose}\nMỗi lượt chỉ tạo một phản hồi hoàn chỉnh.\nKhông lặp lại nguyên câu hoặc cùng một ý vừa gửi.\nĐọc lịch sử trước khi hỏi và tránh hỏi lại điều khách đã trả lời.\nNếu khách gửi nhiều tin ngắn liên tiếp, hiểu chúng như cùng một lượt và trả lời gộp.\n[/PAGEBOT_QUALITY]`;
  }

  async function applyQuality() {
    const textarea = q("#system-prompt");
    if (!textarea || !state?.activeProfile?.id) return;
    const purpose = q("#ai-purpose")?.value || purposeFromPrompt(textarea.value);
    const cleaned = String(textarea.value || "").replace(/\[PAGEBOT_QUALITY\][\s\S]*?\[\/PAGEBOT_QUALITY\]\s*/g, "").trim();
    const next = `${cleaned}\n${qualityBlock(purpose)}`.trim();
    textarea.value = next;
    state.activeProfile = await window.pagebot.profiles.update(state.activeProfile.id, { systemPrompt: next });
  }

  function install() {
    const grid = q("#ai-advanced .ai-advanced-grid");
    if (!grid || q("#ai-purpose")) return false;
    const label = document.createElement("label");
    label.style.gridColumn = "1 / -1";
    label.innerHTML = '<span>Mục đích hội thoại</span><select id="ai-purpose"><option value="consult">Tư vấn đúng nhu cầu</option><option value="zalo">Chuyển sang Zalo</option><option value="close">Chốt đơn</option><option value="zalo-close">Zalo rồi chốt đơn</option></select>';
    grid.appendChild(label);
    const select = q("#ai-purpose");
    select.value = purposeFromPrompt(q("#system-prompt")?.value || state?.activeProfile?.systemPrompt || "");
    select.addEventListener("change", () => void applyQuality());
    q("#apply-ai-style")?.addEventListener("click", () => setTimeout(() => void applyQuality(), 0));
    void applyQuality();
    return true;
  }

  function boot() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 6000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
