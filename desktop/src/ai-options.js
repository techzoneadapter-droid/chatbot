(() => {
  const GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ];

  const $ = (selector) => document.querySelector(selector);

  function injectStyles() {
    if (document.getElementById("pagebot-ai-options-style")) return;
    const style = document.createElement("style");
    style.id = "pagebot-ai-options-style";
    style.textContent = `
      .ai-advanced { margin-top: 10px; border-top: 1px solid #edf0f4; padding-top: 9px; }
      .ai-advanced summary { cursor: pointer; color: #445168; font-size: 11px; font-weight: 800; user-select: none; }
      .ai-advanced-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 9px; }
      .ai-advanced-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
      .ai-test-result { margin-top: 8px; padding: 8px 9px; border:1px solid #dce2ea; border-radius:9px; background:#f8fafc; color:#5d687b; font-size:10px; line-height:1.45; }
      .ai-test-result.ok { border-color:#bae4ce; background:#f0faf5; color:#16764b; }
      .ai-test-result.warn { border-color:#ead7a6; background:#fff9ec; color:#8b681a; }
      .ai-test-result.error { border-color:#f0bec4; background:#fff4f5; color:#b73240; }
      .model-suggestions { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
      .model-chip { border:1px solid #dce2ea; background:#fff; color:#5b687c; border-radius:999px; padding:4px 7px; font-size:9px; font-weight:700; }
      .model-chip:hover { background:#f2f6fa; }
      .ai-config-note { margin:7px 0 0; color:#8490a1; font-size:9px; line-height:1.45; }
    `;
    document.head.appendChild(style);
  }

  function ensureModelList() {
    const input = $("#ai-model");
    if (!input || document.getElementById("gemini-model-list")) return;
    const list = document.createElement("datalist");
    list.id = "gemini-model-list";
    GEMINI_MODELS.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      list.appendChild(option);
    });
    document.body.appendChild(list);
    input.setAttribute("list", "gemini-model-list");
  }

  function ensureAdvancedPanel() {
    const apiCard = $("#api-status")?.closest("section.card");
    if (!apiCard || document.getElementById("ai-advanced")) return;

    const chips = GEMINI_MODELS.slice(0, 4).map((model) => `<button type="button" class="model-chip" data-model="${model}">${model.replace("gemini-", "")}</button>`).join("");
    const panel = document.createElement("details");
    panel.id = "ai-advanced";
    panel.className = "ai-advanced";
    panel.innerHTML = `
      <summary>⚙ Cấu hình AI nâng cao</summary>
      <div class="model-suggestions" id="model-suggestions">${chips}</div>
      <div class="ai-advanced-grid">
        <label><span>Phong cách</span><select id="ai-style"><option value="natural">Tự nhiên</option><option value="concise">Ngắn gọn</option><option value="sales">Tư vấn & chốt sale</option><option value="support">CSKH nhẹ nhàng</option></select></label>
        <label><span>Độ dài</span><select id="ai-length"><option value="short">Ngắn 1–3 câu</option><option value="very-short">Rất ngắn 1–2 câu</option><option value="medium">Vừa 3–5 câu</option></select></label>
        <label><span>Xưng hô</span><select id="ai-address"><option value="em">Em · anh/chị</option><option value="toi">Tôi · bạn</option><option value="minh">Mình · bạn</option></select></label>
        <label><span>Emoji</span><select id="ai-emoji"><option value="little">Ít, tự nhiên</option><option value="none">Không dùng</option><option value="normal">Dùng vừa phải</option></select></label>
      </div>
      <div class="ai-advanced-actions">
        <button type="button" id="apply-ai-style" class="secondary">Áp dụng cách nói</button>
        <button type="button" id="find-working-model" class="ghost">Tìm model hoạt động</button>
      </div>
      <p class="ai-config-note">Các lựa chọn phong cách được chuyển thành hướng dẫn thật cho AI trong ô “Cách bot nói chuyện”. Model vẫn có thể nhập thủ công.</p>
      <div id="ai-test-result" class="ai-test-result">Chưa kiểm tra AI trong phiên này.</div>
    `;
    apiCard.appendChild(panel);

    panel.querySelectorAll("[data-model]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("#ai-model");
        if (input) input.value = button.dataset.model || "";
      });
    });
    $("#apply-ai-style")?.addEventListener("click", applyStylePrompt);
    $("#find-working-model")?.addEventListener("click", findWorkingModel);
  }

  function buildStylePrompt() {
    const style = $("#ai-style")?.value || "natural";
    const length = $("#ai-length")?.value || "short";
    const address = $("#ai-address")?.value || "em";
    const emoji = $("#ai-emoji")?.value || "little";

    const styleMap = {
      natural: "Nói tự nhiên như nhân viên thật, không máy móc.",
      concise: "Trả lời thẳng vào câu hỏi, không lan man và tránh lặp ý.",
      sales: "Tư vấn đúng nhu cầu, làm rõ lợi ích và chốt bước tiếp theo một cách tự nhiên, không ép mua.",
      support: "Ưu tiên giải thích dễ hiểu, lịch sự, kiên nhẫn và hỗ trợ khách xử lý vấn đề."
    };
    const lengthMap = {
      "very-short": "Mỗi phản hồi thường chỉ 1–2 câu.",
      short: "Mỗi phản hồi thường 1–3 câu.",
      medium: "Mỗi phản hồi có thể 3–5 câu khi cần giải thích."
    };
    const addressMap = {
      em: "Xưng em và gọi khách là anh/chị khi phù hợp.",
      toi: "Xưng tôi và gọi khách là bạn.",
      minh: "Xưng mình và gọi khách là bạn."
    };
    const emojiMap = {
      none: "Không dùng emoji.",
      little: "Chỉ dùng emoji rất ít khi thật sự tự nhiên.",
      normal: "Có thể dùng emoji vừa phải, không lạm dụng."
    };
    return [styleMap[style], lengthMap[length], addressMap[address], emojiMap[emoji], "Chỉ hỏi tối đa 1 câu quan trọng ở cuối nếu cần thêm thông tin."].join("\n");
  }

  function applyStylePrompt() {
    const textarea = $("#system-prompt");
    if (!textarea) return;
    const markerStart = "[PAGEBOT_STYLE]";
    const markerEnd = "[/PAGEBOT_STYLE]";
    const block = `${markerStart}\n${buildStylePrompt()}\n${markerEnd}`;
    const current = textarea.value || "";
    const pattern = /\[PAGEBOT_STYLE\][\s\S]*?\[\/PAGEBOT_STYLE\]\s*/g;
    textarea.value = `${block}\n${current.replace(pattern, "").trim()}`.trim();
    if (typeof log === "function") log("Đã áp dụng cấu hình phong cách vào hướng dẫn AI.", "success");
  }

  function testResult(text, type = "") {
    const box = $("#ai-test-result");
    if (!box) return;
    box.textContent = text;
    box.className = `ai-test-result ${type}`.trim();
  }

  function isRetryableModelError(error) {
    const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error));
    return /429|503|high demand|overload|model|404|not found|unavailable|quota/i.test(text);
  }

  async function runSingleTest() {
    if (typeof saveActiveProfile === "function") {
      const saved = await saveActiveProfile({ showBusy: false, quiet: true });
      if (!saved) throw new Error("Không lưu được cấu hình AI.");
    }
    return window.pagebot.ai.test();
  }

  async function findWorkingModel() {
    if (!state?.activeProfile) return;
    const provider = $("#ai-provider")?.value || "gemini";
    if (provider !== "gemini") {
      testResult("Meta Model API dùng Model ID theo tài khoản của bạn. Hãy nhập đúng Model ID rồi bấm Kiểm tra AI.", "warn");
      return;
    }

    const button = $("#find-working-model");
    if (button) button.disabled = true;
    testResult("Đang thử các model Gemini...", "warn");
    const current = $("#ai-model")?.value?.trim();
    const candidates = [...new Set([current, ...GEMINI_MODELS].filter(Boolean))];
    let lastError = null;
    try {
      for (const model of candidates) {
        $("#ai-model").value = model;
        try {
          const result = await runSingleTest();
          testResult(`✓ Hoạt động: ${result.model} · ${result.latencyMs}ms`, "ok");
          if (typeof log === "function") log(`Đã chọn model hoạt động: ${result.model}.`, "success");
          return;
        } catch (error) {
          lastError = error;
          if (!isRetryableModelError(error)) break;
        }
      }
      throw lastError || new Error("Không tìm thấy model hoạt động.");
    } catch (error) {
      const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error));
      testResult(`✕ ${text}`, "error");
      if (typeof log === "function") log(text, "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function replaceTestButtonBehavior() {
    const button = $("#test-ai");
    if (!button || button.dataset.pagebotAdvanced === "1") return;
    button.dataset.pagebotAdvanced = "1";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!state?.activeProfile) return;
      button.disabled = true;
      testResult("Đang kiểm tra kết nối AI...", "warn");
      try {
        const result = await runSingleTest();
        testResult(`✓ ${result.provider === "meta" ? "Meta Model API" : "Gemini"} hoạt động · ${result.model} · ${result.latencyMs}ms`, "ok");
        if (typeof log === "function") log(`${result.provider === "meta" ? "Meta Model API" : "Gemini"} hoạt động · ${result.model} · ${result.latencyMs}ms.`, "success");
      } catch (error) {
        const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error));
        testResult(`✕ ${text}`, "error");
        if (typeof log === "function") log(text, "error");
      } finally {
        button.disabled = false;
      }
    }, true);
  }

  function updateProviderUi() {
    const provider = $("#ai-provider")?.value || "gemini";
    const suggestions = $("#model-suggestions");
    if (suggestions) suggestions.style.display = provider === "gemini" ? "flex" : "none";
    const find = $("#find-working-model");
    if (find) find.style.display = provider === "gemini" ? "inline-flex" : "none";
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    ensureModelList();
    ensureAdvancedPanel();
    replaceTestButtonBehavior();
    $("#ai-provider")?.addEventListener("change", updateProviderUi);
    updateProviderUi();
  });
})();
