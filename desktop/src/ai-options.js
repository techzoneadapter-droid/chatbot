(() => {
  const $ = (selector) => document.querySelector(selector);
  let discoveredModels = { gemini: [], meta: [] };

  function injectStyles() {
    if (document.getElementById("pagebot-ai-options-style")) return;
    const style = document.createElement("style");
    style.id = "pagebot-ai-options-style";
    style.textContent = `
      .ai-advanced { margin-top: 10px; border-top: 1px solid #edf0f4; padding-top: 9px; }
      .ai-advanced summary { cursor: pointer; color: #445168; font-size: 11px; font-weight: 800; user-select: none; }
      .ai-advanced-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 9px; }
      .ai-advanced-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
      .ai-test-result { margin-top: 8px; padding: 8px 9px; border:1px solid #dce2ea; border-radius:9px; background:#f8fafc; color:#5d687b; font-size:10px; line-height:1.45; overflow-wrap:anywhere; }
      .ai-test-result.ok { border-color:#bae4ce; background:#f0faf5; color:#16764b; }
      .ai-test-result.warn { border-color:#ead7a6; background:#fff9ec; color:#8b681a; }
      .ai-test-result.error { border-color:#f0bec4; background:#fff4f5; color:#b73240; }
      .model-suggestions { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
      .model-chip { border:1px solid #dce2ea; background:#fff; color:#5b687c; border-radius:999px; padding:4px 7px; font-size:9px; font-weight:700; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
      .model-chip:hover { background:#f2f6fa; }
      .ai-config-note { margin:7px 0 0; color:#8490a1; font-size:9px; line-height:1.45; }
    `;
    document.head.appendChild(style);
  }

  function ensureModelList() {
    const input = $("#ai-model");
    if (!input) return;
    let list = document.getElementById("pagebot-model-list");
    if (!list) {
      list = document.createElement("datalist");
      list.id = "pagebot-model-list";
      document.body.appendChild(list);
    }
    input.setAttribute("list", "pagebot-model-list");
  }

  function renderModels(provider, models) {
    discoveredModels[provider] = Array.isArray(models) ? models : [];
    const list = document.getElementById("pagebot-model-list");
    if (list) {
      list.innerHTML = "";
      discoveredModels[provider].forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        list.appendChild(option);
      });
    }

    const suggestions = $("#model-suggestions");
    if (!suggestions) return;
    suggestions.innerHTML = "";
    discoveredModels[provider].slice(0, 8).forEach((model) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-chip";
      button.dataset.model = model;
      button.textContent = model.replace(/^gemini-/, "");
      button.title = model;
      button.addEventListener("click", () => {
        const input = $("#ai-model");
        if (input) input.value = model;
      });
      suggestions.appendChild(button);
    });
  }

  function ensureAdvancedPanel() {
    const apiCard = $("#api-status")?.closest("section.card");
    if (!apiCard || document.getElementById("ai-advanced")) return;

    const panel = document.createElement("details");
    panel.id = "ai-advanced";
    panel.className = "ai-advanced";
    panel.innerHTML = `
      <summary>⚙ Cấu hình AI nâng cao</summary>
      <div class="model-suggestions" id="model-suggestions"></div>
      <div class="ai-advanced-grid">
        <label><span>Phong cách</span><select id="ai-style"><option value="natural">Tự nhiên</option><option value="concise">Ngắn gọn</option><option value="sales">Tư vấn & chốt sale</option><option value="support">CSKH nhẹ nhàng</option><option value="professional">Chuyên nghiệp</option></select></label>
        <label><span>Độ dài</span><select id="ai-length"><option value="short">Ngắn 1–3 câu</option><option value="very-short">Rất ngắn 1–2 câu</option><option value="medium">Vừa 3–5 câu</option><option value="detailed">Chi tiết khi cần</option></select></label>
        <label><span>Xưng hô</span><select id="ai-address"><option value="em">Em · anh/chị</option><option value="toi">Tôi · bạn</option><option value="minh">Mình · bạn</option><option value="brand">Theo tên thương hiệu</option></select></label>
        <label><span>Emoji</span><select id="ai-emoji"><option value="little">Ít, tự nhiên</option><option value="none">Không dùng</option><option value="normal">Dùng vừa phải</option></select></label>
        <label><span>Mục tiêu</span><select id="ai-goal"><option value="consult">Tư vấn đúng nhu cầu</option><option value="close">Ưu tiên chốt bước tiếp theo</option><option value="support">Ưu tiên hỗ trợ</option><option value="neutral">Chỉ trả lời câu hỏi</option></select></label>
        <label><span>Hỏi lại</span><select id="ai-question"><option value="needed">Chỉ khi thật sự cần</option><option value="proactive">Chủ động hỏi 1 câu</option><option value="minimal">Hạn chế hỏi lại</option></select></label>
      </div>
      <div class="ai-advanced-actions">
        <button type="button" id="apply-ai-style" class="secondary">Áp dụng cách nói</button>
        <button type="button" id="load-models" class="ghost">Tải model khả dụng</button>
      </div>
      <p class="ai-config-note">“Tải model khả dụng” đọc danh sách model thật từ API key hiện tại, không thử tuần tự các tên model nên nhanh hơn nhiều.</p>
      <div id="ai-test-result" class="ai-test-result">Chưa kiểm tra AI trong phiên này.</div>
    `;
    apiCard.appendChild(panel);

    $("#apply-ai-style")?.addEventListener("click", applyStylePrompt);
    $("#load-models")?.addEventListener("click", loadAvailableModels);
  }

  function buildStylePrompt() {
    const style = $("#ai-style")?.value || "natural";
    const length = $("#ai-length")?.value || "short";
    const address = $("#ai-address")?.value || "em";
    const emoji = $("#ai-emoji")?.value || "little";
    const goal = $("#ai-goal")?.value || "consult";
    const question = $("#ai-question")?.value || "needed";

    const styleMap = {
      natural: "Nói tự nhiên như nhân viên thật, không máy móc.",
      concise: "Trả lời thẳng vào câu hỏi, không lan man và tránh lặp ý.",
      sales: "Tư vấn thuyết phục nhưng tự nhiên, không gây áp lực mua.",
      support: "Lịch sự, kiên nhẫn, dễ hiểu và ưu tiên xử lý vấn đề của khách.",
      professional: "Giọng điệu chuyên nghiệp, rõ ràng, chắc chắn và lịch sự."
    };
    const lengthMap = {
      "very-short": "Mỗi phản hồi thường chỉ 1–2 câu.",
      short: "Mỗi phản hồi thường 1–3 câu.",
      medium: "Mỗi phản hồi có thể 3–5 câu khi cần giải thích.",
      detailed: "Có thể trả lời chi tiết hơn khi câu hỏi phức tạp, nhưng không dài dòng."
    };
    const addressMap = {
      em: "Xưng em và gọi khách là anh/chị khi phù hợp.",
      toi: "Xưng tôi và gọi khách là bạn.",
      minh: "Xưng mình và gọi khách là bạn.",
      brand: "Ưu tiên xưng bằng tên cửa hàng/thương hiệu nếu ngữ cảnh đã có tên thương hiệu."
    };
    const emojiMap = {
      none: "Không dùng emoji.",
      little: "Chỉ dùng emoji rất ít khi thật sự tự nhiên.",
      normal: "Có thể dùng emoji vừa phải, không lạm dụng."
    };
    const goalMap = {
      consult: "Mục tiêu chính là hiểu đúng nhu cầu và tư vấn sản phẩm phù hợp.",
      close: "Nếu đã đủ thông tin, khéo léo hướng khách tới bước tiếp theo như để lại thông tin, đặt hàng hoặc xác nhận nhu cầu.",
      support: "Mục tiêu chính là giải đáp và hỗ trợ khách nhanh, chính xác.",
      neutral: "Chỉ trả lời đúng điều khách hỏi, không cố chốt sale."
    };
    const questionMap = {
      needed: "Chỉ hỏi tối đa 1 câu khi thiếu thông tin quan trọng.",
      proactive: "Có thể chủ động hỏi tối đa 1 câu ngắn để hiểu nhu cầu tốt hơn.",
      minimal: "Hạn chế hỏi lại; nếu có thể trả lời an toàn từ dữ liệu hiện có thì trả lời luôn."
    };

    return [styleMap[style], lengthMap[length], addressMap[address], emojiMap[emoji], goalMap[goal], questionMap[question]].join("\n");
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

  function cleanError(error) {
    const text = typeof errorText === "function" ? errorText(error) : (error?.message || String(error));
    if (/AbortError|operation was aborted/i.test(text)) return "Kết nối AI quá thời gian. Hãy thử lại hoặc kiểm tra mạng/API.";
    return text;
  }

  async function saveCurrentConfig() {
    if (typeof saveActiveProfile !== "function") return true;
    return saveActiveProfile({ showBusy: false, quiet: true });
  }

  async function loadAvailableModels() {
    if (!state?.activeProfile) return;
    const provider = $("#ai-provider")?.value || "gemini";
    const button = $("#load-models");
    if (button) button.disabled = true;
    testResult("Đang tải danh sách model từ provider...", "warn");
    try {
      const result = await window.pagebot.ai.models(provider);
      const models = Array.isArray(result?.models) ? result.models : [];
      renderModels(provider, models);
      if (!models.length) throw new Error("API key hợp lệ nhưng provider không trả về model chat khả dụng.");
      const input = $("#ai-model");
      const current = input?.value?.trim();
      if (input && (!current || !models.includes(current))) input.value = result.recommended || models[0];
      testResult(`✓ Tìm thấy ${models.length} model. Đã chọn: ${input?.value || result.recommended || models[0]}`, "ok");
      if (typeof log === "function") log(`Đã tải ${models.length} model ${provider === "meta" ? "Meta" : "Gemini"} khả dụng.`, "success");
    } catch (error) {
      const text = cleanError(error);
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
      testResult("Đang kiểm tra đúng model đã chọn...", "warn");
      try {
        const saved = await saveCurrentConfig();
        if (!saved) throw new Error("Không lưu được cấu hình AI.");
        const provider = $("#ai-provider")?.value || "gemini";
        const model = $("#ai-model")?.value?.trim();
        const result = await window.pagebot.ai.probe({ provider, model });
        testResult(`✓ ${provider === "meta" ? "Meta Model API" : "Gemini"} hoạt động · ${result.model} · ${result.latencyMs}ms`, "ok");
        if (typeof log === "function") log(`${provider === "meta" ? "Meta Model API" : "Gemini"} hoạt động · ${result.model} · ${result.latencyMs}ms.`, "success");
      } catch (error) {
        const text = cleanError(error);
        testResult(`✕ ${text}`, "error");
        if (typeof log === "function") log(text, "error");
      } finally {
        button.disabled = false;
      }
    }, true);
  }

  function updateProviderUi() {
    const provider = $("#ai-provider")?.value || "gemini";
    ensureModelList();
    renderModels(provider, discoveredModels[provider] || []);
    const loadButton = $("#load-models");
    if (loadButton) loadButton.textContent = provider === "meta" ? "Tải model Meta" : "Tải model Gemini";
    testResult("Chưa kiểm tra AI trong phiên này.", "");
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
