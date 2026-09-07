import { detectIntent } from "@/lib/ai/intent-detector";
import { scoreLeadDetailed } from "@/lib/ai/lead-scorer";
import { detectVietnamesePhone } from "@/lib/ai/phone-detector";
import { generateWithPageProvider, LocalFallbackProvider } from "@/lib/ai/providers";
import { estimatePaintQuantity, parseAreaNumber } from "@/lib/products/paint-calculator";
import { recommendProducts } from "@/lib/products/product-service";
import type { Product, QualificationStage, SalesEngineInput, SalesEngineOutput } from "@/lib/types";

function extractArea(message: string) {
  const match = message.match(/\b\d{2,4}\s*(m2|m²|mét vuông|met vuong|mét|met)\b/i);
  return match?.[0].replace(/\s+/g, " ").trim() ?? null;
}

function extractFloors(message: string) {
  const match = message.match(/\b\d{1,2}\s*(tầng|tang|lầu|lau)\b/i);
  return match?.[0].replace(/\s+/g, " ").trim() ?? null;
}

function extractBudget(message: string) {
  return message.match(/\b\d{1,3}(?:[.,]\d{1,2})?\s*(triệu|trieu|tr|k|ngàn|ngan|nghìn|nghin|vnd|đồng|dong)\b/i)?.[0] ?? null;
}

function extractName(message: string) {
  const match = message.match(/(?:anh|chị|em|tôi|mình)\s+(?:là|la|tên|ten)\s+([\p{L}\s]{2,30})(?:[,.!?]|$)/iu);
  return match?.[1]?.trim() ?? null;
}

function projectType(message: string) {
  if (/(xây mới|xay moi|nhà mới|nha moi|đang xây|dang xay|xây nhà|xay nha)/i.test(message)) return "Nha xay moi";
  if (/(sơn lại|son lai|sửa lại|sua lai|sửa nhà|sua nha|cải tạo|cai tao|nhà cũ|nha cu|làm mới|lam moi)/i.test(message)) return "Son lai / cai tao";
  return null;
}

function extractLocation(message: string) {
  const match = message.match(/(?:^|\s)(?:ở|o|tại|tai)\s+([\p{L}\s]{2,40})(?:[,.!?]|$)/iu);
  return match?.[1]?.trim() ?? null;
}

function extractAddress(message: string) {
  const match = message.match(/(?:dia chi|địa chỉ|giao toi|giao tới|nhan hang|nhận hàng|ở|o|tại|tai)\s+(.{8,140})/iu);
  return match?.[1]?.replace(/[<>]/g, "").trim() ?? null;
}

function extractQuantity(message: string) {
  const match = message.match(/\b\d+\s*(thung|thùng|lon|lit|lít|bo|bộ|kg)\b/iu);
  return match?.[0]?.trim() ?? null;
}

function productInterest(message: string) {
  if (/(chống thấm|chong tham|thấm|tham|waterproof)/i.test(message)) return "Son chong tham";
  if (/(cả trong.*ngoài|ca trong.*ngoai|trong.*ngoài|trong.*ngoai|noi that.*ngoai that|ngoai that.*noi that)/i.test(message)) {
    return "Son noi that va ngoai that";
  }
  if (/(ngoại thất|ngoai that|bên ngoài|ben ngoai|mặt tiền|mat tien|tường ngoài|tuong ngoai|exterior)/i.test(message)) return "Son ngoai that";
  if (/(nội thất|noi that|trong nhà|trong nha|phòng|phong|interior|living|bedroom)/i.test(message)) return "Son noi that";
  if (/(lót|lot|sơn lót|son lot|primer)/i.test(message)) return "Son lot";
  return null;
}

function pickStage(score: number, phone: string | null, handoff: boolean): QualificationStage {
  if (handoff) return "handoff";
  if (phone) return "ready_for_quote";
  if (score >= 40) return "qualifying";
  return "discovery";
}

function hasKnownPrice(products: Product[]) {
  return products.some((product) => product.price !== null);
}

function productSummary(products: Product[]) {
  return products
    .map((product) => {
      const details = [product.category];
      if (product.coverage) details.push(`do phu ${product.coverage}`);
      if (product.is_demo) details.push("DEMO data");
      return `${product.name} (${details.join(", ")})`;
    })
    .join("; ");
}

function priceSafetyReply() {
  return "Phần giá hiện bên em chưa cập nhật chính xác trong hệ thống nên em không muốn báo sai cho anh/chị. Nếu anh/chị muốn, em có thể lấy SĐT để bên kinh doanh báo giá chính xác cho mình ạ.";
}

function noProductReply(interest: string | null) {
  return `Dạ hiện trong hệ thống em chưa có sản phẩm ${interest ? interest.toLowerCase() : "phù hợp"} được cập nhật chính xác, nên em không tự gợi ý sai. Em có thể chuyển nhân viên kiểm tra và tư vấn dòng phù hợp cho mình ạ.`;
}

function hasEnoughValueForPhone(input: {
  area: string | null;
  floors: string | null;
  interest: string | null;
  type: string | null;
  commercialIntent: boolean;
  score: number;
}) {
  const qualifiedNeed = Boolean((input.area || input.floors) && (input.interest || input.type));
  return qualifiedNeed && (input.commercialIntent || input.score >= 55);
}

function localReply(input: SalesEngineInput): SalesEngineOutput {
  const phone = detectVietnamesePhone(input.customerMessage);
  const intent = detectIntent(input.customerMessage);
  const scoring = scoreLeadDetailed(intent, input.state, input.customerMessage);
  const area = extractArea(input.customerMessage) ?? input.state.collected_area ?? null;
  const floors = extractFloors(input.customerMessage) ?? input.state.collected_floors ?? null;
  const budget = extractBudget(input.customerMessage) ?? input.state.collected_budget ?? null;
  const location = extractLocation(input.customerMessage) ?? input.state.collected_location ?? null;
  const address = extractAddress(input.customerMessage) ?? input.state.collected_address ?? null;
  const quantity = extractQuantity(input.customerMessage) ?? input.state.collected_quantity ?? null;
  const type = projectType(input.customerMessage) ?? input.state.collected_project_type ?? null;
  const interest = productInterest(input.customerMessage) ?? input.state.collected_product_interest ?? null;
  const name = extractName(input.customerMessage) ?? input.state.collected_name ?? null;
  const recommendationQuery = [input.customerMessage, interest, type].filter(Boolean).join(" ");
  const recommendationProducts = input.retrievedProducts ?? recommendProducts(recommendationQuery, input.products, intent);
  const recommendations = recommendationProducts.map((product) => product.name);
  const hasPhone = Boolean(phone.normalized || input.state.collected_phone);
  const hasInvalidPhone = Boolean(phone.raw && !phone.valid);
  const shouldHandoff = intent === "human_request" || intent === "complaint";
  const commercialIntent = ["price_inquiry", "quotation_request", "delivery_question", "purchase_intent", "discount_question", "human_request"].includes(intent);
  const shouldRequestPhone =
    !hasPhone &&
    !hasInvalidPhone &&
    !shouldHandoff &&
    hasEnoughValueForPhone({ area, floors, interest, type, commercialIntent, score: scoring.score });
  const stage = pickStage(scoring.score, hasPhone ? phone.normalized ?? input.state.collected_phone ?? null : null, shouldHandoff);

  let reply = input.pageContext?.ai_fallback_message || "Dạ em chào anh/chị. Mình đang cần tư vấn sơn nhà mới, sơn lại hay xử lý chống thấm ạ?";
  let nextAction: SalesEngineOutput["next_action"] = "reply";

  if (phone.valid) {
    nextAction = address ? (quantity ? "confirm_order" : "ask_quantity") : "ask_address";
    reply = address
      ? "Dạ em nhận được SĐT và địa chỉ của mình rồi ạ. Anh/chị cho em xin số lượng hoặc dung tích sản phẩm cần lấy để em tổng hợp đơn nhé."
      : "Dạ em nhận được SĐT của mình rồi ạ. Anh/chị cho em xin địa chỉ nhận hàng để em tổng hợp thông tin đơn nhé.";
  } else if (hasInvalidPhone) {
    reply = "Dạ em thấy mình vừa gửi SĐT nhưng định dạng chưa đúng số di động Việt Nam. Anh/chị kiểm tra lại giúp em số 10 chữ số, ví dụ 0901234567 nhé.";
  } else if (shouldHandoff) {
    nextAction = "handoff";
    reply = "Dạ được ạ, em chuyển cuộc trò chuyện này cho nhân viên phụ trách để tư vấn trực tiếp cho mình. Sau tin nhắn này AI sẽ dừng trả lời tự động nhé.";
  } else if (intent === "address_provided") {
    nextAction = hasPhone ? (quantity ? "confirm_order" : "ask_quantity") : "ask_phone";
    reply = hasPhone
      ? "Dạ em đã ghi nhận địa chỉ. Anh/chị cho em xin số lượng sản phẩm cần lấy để em tổng hợp đơn nhé."
      : "Dạ em đã ghi nhận địa chỉ. Anh/chị cho em xin SĐT nhận hàng để bên em liên hệ xác nhận nhé.";
  } else if (intent === "quantity_provided") {
    nextAction = hasPhone && address ? "confirm_order" : hasPhone ? "ask_address" : "ask_phone";
    reply =
      hasPhone && address
        ? "Dạ em đã có SĐT, địa chỉ và số lượng. Em sẽ tổng hợp đơn và chuyển nhân viên xác nhận giá/chính sách chính xác trước khi lên đơn ạ."
        : hasPhone
          ? "Dạ em ghi nhận số lượng. Anh/chị cho em xin địa chỉ nhận hàng để tổng hợp đơn nhé."
          : "Dạ em ghi nhận số lượng. Anh/chị cho em xin SĐT để nhân viên xác nhận đơn và báo giá chính xác nhé.";
  } else if (/ai|robot|máy|may/i.test(input.customerMessage)) {
    reply = "Dạ em là trợ lý AI hỗ trợ tư vấn ban đầu và ghi nhận nhu cầu. Những phần cần báo giá, tồn kho, giao hàng hoặc kỹ thuật chi tiết em sẽ chuyển nhân viên xác nhận cho mình ạ.";
  } else if (intent === "greeting") {
    reply = "Dạ em chào anh/chị. Mình đang sơn nhà mới, sơn lại hay cần xử lý chống thấm để em tư vấn đúng hướng ạ?";
  } else if (intent === "purchase_intent") {
    nextAction = hasPhone ? (address ? (quantity ? "confirm_order" : "ask_quantity") : "ask_address") : "ask_phone";
    reply = hasEnoughValueForPhone({ area, floors, interest, type, commercialIntent: true, score: scoring.score })
      ? "Dạ nếu mình muốn lấy luôn thì em sẽ nhờ bên kinh doanh kiểm tra giá và chương trình hiện tại cho sát nhất. Anh/chị cho em xin SĐT để liên hệ tư vấn cụ thể nhé."
      : "Dạ em hiểu rồi ạ. Để chốt đúng loại sơn, anh/chị cho em biết mình cần sơn trong nhà, ngoài trời hay cả hai phần nhé?";
  } else if (intent === "price_inquiry" || intent === "quotation_request" || intent === "discount_question") {
    if (area || floors) {
      const knownFacts = [type?.toLowerCase(), area ? `khoang ${area}` : null, floors, interest?.toLowerCase()].filter(Boolean).join(", ");
      const productsText = recommendationProducts.length ? ` Em dang thay dong phu hop trong KB: ${productSummary(recommendationProducts)}.` : "";
      reply = `Dạ với thông tin ${knownFacts}, em có thể định hướng sản phẩm trước cho mình.${productsText} ${hasKnownPrice(recommendationProducts) ? "Giá trong hệ thống chỉ áp dụng theo sản phẩm đã cập nhật, mình nên để kinh doanh xác nhận lại theo đúng dung tích và chương trình." : priceSafetyReply()}`;
    } else {
      reply = "Dạ để báo giá sát hơn, em cần biết diện tích hoặc quy mô nhà trước ạ. Nhà mình khoảng bao nhiêu m2 hoặc mấy tầng vậy anh/chị?";
    }
  } else if (intent === "new_house" || intent === "renovation") {
    reply = area || floors
      ? `Dạ em ghi nhận nhà mình ${type?.toLowerCase() ?? "đang cần sơn"}${floors ? `, ${floors}` : ""}${area ? `, khoảng ${area}` : ""}. Với phần này thường nên tính cả sơn lót và sơn phủ. Anh/chị muốn sơn trong nhà, ngoài trời hay cả hai phần ạ?`
      : `Dạ ${type === "Nha xay moi" ? "nhà xây mới" : "sơn lại"} thì em có thể tư vấn từ sơn lót đến sơn phủ luôn. Nhà mình khoảng bao nhiêu m2 hoặc mấy tầng vậy anh/chị?`;
  } else if (intent === "waterproofing") {
    reply = recommendationProducts.length
      ? `Dạ với nhu cầu chống thấm, em thấy sản phẩm trong dữ liệu: ${productSummary(recommendationProducts)}. Mình đang bị thấm ở sân thượng, nhà vệ sinh, ban công hay tường ngoài ạ?`
      : noProductReply("son chong tham");
  } else if ((area && area !== input.state.collected_area) || (floors && floors !== input.state.collected_floors)) {
    reply = `Dạ em ghi nhận nhà mình${floors ? ` ${floors}` : ""}${area ? `, khoảng ${area}` : ""}. Anh/chị muốn sơn nội thất, ngoại thất hay cả trong ngoài để em gợi ý đúng dòng sơn hơn ạ?`;
  } else if (location && location !== input.state.collected_location) {
    reply = `Dạ em ghi nhận nhà mình ở ${location}. Mình đang ưu tiên sơn nội thất, ngoại thất hay chống thấm để em tư vấn đúng sản phẩm hơn ạ?`;
  } else if (intent === "delivery_question") {
    reply = "Dạ phần thời gian giao hàng và tồn kho hiện em chưa có dữ liệu chính xác theo khu vực, nên em không tự hứa lịch giao. Em có thể chuyển nhân viên kiểm tra theo địa chỉ và báo lại chính xác cho mình ạ.";
  } else if (intent === "coverage_question") {
    const estimate = estimatePaintQuantity({
      area: parseAreaNumber(area),
      coats: recommendationProducts[0]?.coats,
      coverage: recommendationProducts[0]?.coverage_value
    });
    reply = recommendationProducts.length
      ? `Dạ độ phủ tham khảo trong dữ liệu hiện có: ${productSummary(recommendationProducts)}.${estimate.required_liters ? ` Ước tính tham khảo: khoảng ${estimate.required_liters} lít cho ${area}, chưa phải báo giá chính thức.` : " Lượng sơn thực tế còn phụ thuộc bề mặt, số lớp và phần trong/ngoài nhà nên em cần diện tích, số lớp và độ phủ chính thức để ước tính."}`
      : "Dạ hiện em chưa có dữ liệu độ phủ chính thức cho dòng sản phẩm này, nên em sẽ không tự ước lượng sai. Anh/chị cho em biết diện tích để nhân viên tính lại chính xác nhé.";
  } else if (intent === "product_question" || interest) {
    const summary = productSummary(recommendationProducts);
    reply = !recommendationProducts.length
      ? noProductReply(interest)
      : area || floors
        ? `Dạ dựa trên thông tin mình đã chia sẻ${type ? `, ${type.toLowerCase()}` : ""}${floors ? `, ${floors}` : ""}${area ? `, khoảng ${area}` : ""}${interest ? `, nhu cầu ${interest.toLowerCase()}` : ""}, em gợi ý mình xem ${summary}. ${hasKnownPrice(recommendationProducts) ? "Giá cụ thể mình nên để nhân viên xác nhận theo đúng dung tích và chương trình hiện tại." : "Giá, bảo hành và giao hàng hiện chưa có dữ liệu chính thức nên em không tự bịa cho mình."}`
        : `Dạ em có thể gợi ý trước ${summary}. Để chọn sát hơn, anh/chị cho em biết nhà mình khoảng bao nhiêu m2 hoặc mấy tầng ạ?`;
  }

  if (shouldRequestPhone && !reply.includes("SDT")) {
    nextAction = "ask_phone";
    reply += " Nếu anh/chị muốn, cho em xin SĐT để bên kinh doanh báo giá chính xác theo diện tích và chương trình hiện tại nhé.";
  }

  const extracted = {
    name,
    phone: phone.raw,
    normalized_phone: phone.normalized,
    location,
    address,
    quantity,
    area,
    floors,
    project_type: type,
    budget,
    product_interest: interest
  };

  return {
    reply,
    intent,
    lead_score: scoring.score,
    qualification_stage: stage,
    should_request_phone: shouldRequestPhone,
    should_handoff: shouldHandoff,
    next_action: nextAction,
    confidence: shouldHandoff ? 0.95 : intent === "unknown" ? 0.35 : 0.78,
    scored_signals: scoring.signals,
    recommendations,
    extracted,
    extracted_customer_data: extracted
  };
}

export async function runSalesEngine(input: SalesEngineInput): Promise<SalesEngineOutput> {
  const intent = detectIntent(input.customerMessage);
  const interest = productInterest(input.customerMessage) ?? input.state.collected_product_interest ?? null;
  const retrievedProducts = recommendProducts([input.customerMessage, interest].filter(Boolean).join(" "), input.products, intent);
  const enrichedInput = { ...input, retrievedProducts };
  const localProvider = new LocalFallbackProvider(localReply);
  const local = await localProvider.generateResponse(enrichedInput);
  const rulesResult = applyPreAIRules(enrichedInput, local);
  if (rulesResult) return rulesResult;
  const ai = await generateWithPageProvider(enrichedInput, localReply);
  const maxLength = input.pageContext?.chat_rules?.max_response_length ?? 900;
  const trimmed = ai.reply.length > maxLength ? { ...ai, reply: `${ai.reply.slice(0, maxLength - 1).trim()}…` } : ai;
  return trimmed.confidence_status === "uncertain" && input.pageContext?.ai_fallback_message
    ? { ...trimmed, reply: input.pageContext.ai_fallback_message, should_handoff: true, confidence_status: "human_required" }
    : trimmed;
}

function applyPreAIRules(input: SalesEngineInput, local: SalesEngineOutput): SalesEngineOutput | null {
  const rules = input.pageContext?.chat_rules;
  const lower = input.customerMessage.toLowerCase();
  if (rules?.stop_on_not_interested !== false && /(khong quan tam|không quan tâm|dung nhan|đừng nhắn|stop)/i.test(lower)) {
    return { ...local, reply: "Dạ em đã ghi nhận mình chưa quan tâm. AI sẽ dừng chăm sóc tự động để tránh làm phiền ạ.", should_handoff: true, next_action: "handoff", confidence_status: "human_required" };
  }
  if (local.intent === "human_request" && rules?.stop_on_human_request !== false) {
    return { ...local, should_handoff: true, next_action: "handoff", confidence_status: "human_required" };
  }
  if (local.intent === "phone_provided" || local.intent === "address_provided" || local.intent === "quantity_provided") return local;
  if (local.intent === "price_inquiry" && rules?.auto_send_price === false) {
    return { ...local, reply: input.pageContext?.ai_fallback_message || priceSafetyReply(), should_handoff: true, confidence_status: "human_required" };
  }
  return null;
}
