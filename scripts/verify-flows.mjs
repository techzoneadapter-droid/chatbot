const base = "http://127.0.0.1:3000";
const runId = Date.now().toString(36);

async function json(path, options = {}) {
  const response = await fetch(base + path, options);
  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }
  return { status: response.status, data };
}

async function send(message, externalUserId = "local-demo") {
  const result = await json("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, externalUserId })
  });
  const state = result.data.state;
  const output = result.data.output;
  console.log(JSON.stringify({
    customer: message,
    status: result.status,
    reply: output?.reply ?? result.data.reply ?? result.data.fallback ?? result.data.error,
    state: state && {
      intent: state.current_intent,
      score: state.lead_score,
      stage: state.qualification_stage,
      area: state.collected_area,
      location: state.collected_location,
      project: state.collected_project_type,
      interest: state.collected_product_interest,
      phone: state.collected_phone,
      requestPhone: state.should_request_phone,
      handoff: state.should_handoff
    },
    lead: result.data.lead && {
      phone: result.data.lead.normalized_phone,
      status: result.data.lead.status,
      score: result.data.lead.lead_score,
      intent: result.data.lead.intent
    }
  }, null, 2));
  return result;
}

async function reset() {
  await json("/api/chat", { method: "DELETE" });
}

async function run() {
  console.log("=== PRIORITY 1/2 LOCAL CHAT + PHONE ===");
  await reset();
  for (const message of [
    "Chào em, anh đang cần sơn lại nhà.",
    "Nhà anh 2 tầng.",
    "Khoảng 100 mét vuông.",
    "Anh muốn sơn cả trong và ngoài.",
    "Loại nào tốt?",
    "Giá bao nhiêu?",
    "Bao giờ giao được?",
    "0987654321",
    "Giá cụ thể sao em?"
  ]) {
    await send(message);
  }

  console.log("=== PHONE FORMATS ===");
  for (const [externalUserId, phone] of [
    [`phone-space-${runId}`, "090 123 4567"],
    [`phone-plus-${runId}`, "+84901234567"],
    [`phone-dash-${runId}`, "090-123-4567"],
    [`phone-invalid-${runId}`, "0123456789"]
  ]) {
    await send("Anh cần sơn nhà 100m2 ngoại thất, báo giá giúp anh.", externalUserId);
    await send(phone, externalUserId);
  }

  console.log("=== PRIORITY 3 MEMORY ===");
  await reset();
  for (const message of [
    "Anh đang sửa nhà.",
    "Nhà anh khoảng 120m2.",
    "Anh ở Hà Nội.",
    "Vậy nhà anh cần loại sơn nào?"
  ]) {
    await send(message);
  }

  console.log("=== PRIORITY 6 HANDOFF ===");
  await reset();
  await send("Cho anh gặp nhân viên.");
  await send("Tin nhắn sau handoff không nên có AI trả lời.");

  console.log("=== PRIORITY 7 ERRORS ===");
  console.log(JSON.stringify(await json("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "" })
  }), null, 2));
  console.log(JSON.stringify(await json("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad"
  }), null, 2));
  console.log(JSON.stringify(await json("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(4500) })
  }), null, 2));

  console.log("=== DASHBOARD/LEADS/CONVERSATIONS ===");
  console.log(JSON.stringify(await json("/api/dashboard"), null, 2));
  console.log(JSON.stringify(await json("/api/leads"), null, 2));
  console.log(JSON.stringify(await json("/api/conversations"), null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
