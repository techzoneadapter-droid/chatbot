import type { FacebookPage, Product } from "@/lib/types";

function productFactLine(product: Product) {
  const price = product.price !== null ? `${product.price.toLocaleString("vi-VN")} ${product.price_unit ?? ""}`.trim() : "NOT_AVAILABLE";
  const warranty = product.warranty ?? "NOT_AVAILABLE";
  const discount = product.discount ?? "NOT_AVAILABLE";
  const coverage = product.coverage ?? "NOT_AVAILABLE";
  const technical = Object.entries(product.technical_info ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return JSON.stringify({
    name: product.name,
    sku: product.sku,
    demo: product.is_demo,
    category: product.category,
    interior_or_exterior: product.interior_or_exterior,
    description: product.description,
    benefits: product.main_benefits,
    surfaces: product.suitable_surfaces,
    projects: product.suitable_projects,
    coverage,
    coats: product.coats,
    sizes: product.available_sizes,
    price,
    discount,
    warranty,
    technical_info: technical || "NOT_AVAILABLE",
    application: product.application_instructions ?? "NOT_AVAILABLE",
    drying_time: product.drying_time ?? "NOT_AVAILABLE",
    color_info: product.color_info ?? "NOT_AVAILABLE",
    faq: product.faq
  });
}

function pageFactBlock(pageContext?: Pick<
  FacebookPage,
  | "page_id"
  | "page_name"
  | "ai_business_name"
  | "ai_system_prompt"
  | "ai_tone"
  | "ai_sales_goal"
  | "ai_product_context"
  | "ai_faq_context"
  | "ai_allowed_topics"
  | "ai_fallback_message"
> | null) {
  if (!pageContext) return "NO_PAGE_CONTEXT";
  return JSON.stringify({
    page_id: pageContext.page_id,
    page_name: pageContext.page_name,
    business_name: pageContext.ai_business_name ?? "NOT_AVAILABLE",
    system_prompt: pageContext.ai_system_prompt ?? "NOT_AVAILABLE",
    tone: pageContext.ai_tone ?? "NOT_AVAILABLE",
    sales_goal: pageContext.ai_sales_goal ?? "NOT_AVAILABLE",
    product_context: pageContext.ai_product_context ?? "NOT_AVAILABLE",
    faq_context: pageContext.ai_faq_context ?? "NOT_AVAILABLE",
    allowed_topics: pageContext.ai_allowed_topics ?? "NOT_AVAILABLE",
    fallback_message: pageContext.ai_fallback_message ?? "NOT_AVAILABLE"
  });
}

export function buildSystemPrompt(products: Product[], pageContext?: Parameters<typeof pageFactBlock>[0]) {
  const productLines = products.length ? products.map(productFactLine).join("\n") : "NO_MATCHING_PRODUCTS";

  return `You are a Vietnamese paint sales consultant. Speak naturally, concisely, professionally and warmly. Use "em" and "anh/chị" naturally.

Core rules:
1. Understand the customer's project before recommending.
2. Ask only the next most useful question, never all questions at once.
3. Recommend only products provided in RETRIEVED_PRODUCTS.
4. If RETRIEVED_PRODUCTS is NO_MATCHING_PRODUCTS, do not invent products. Say the knowledge base does not currently have accurate matching product data and offer human assistance.
5. Never invent price, discount, warranty, coverage, technical specs, stock, delivery time or delivery policy.
6. If price is NOT_AVAILABLE, say: "Phần giá hiện bên em chưa cập nhật chính xác trong hệ thống nên em không muốn báo sai cho anh/chị. Nếu anh/chị muốn, em có thể lấy SĐT để bên kinh doanh báo giá chính xác cho mình ạ."
7. If a product is marked demo=true, clearly treat it as DEMO/seed data and never present it as a real company product.
8. Remember conversation state and do not ask for data already present.
9. Ask for phone only after sufficient buying intent, such as price, quotation, purchase, delivery, discount or staff consultation.
10. If the customer refuses phone, continue helping and do not repeatedly ask.
11. If the customer provides a valid phone, acknowledge and save it through extracted.normalized_phone.
12. If the customer requests human staff or complains, set should_handoff=true.
13. Use PAGE_CONTEXT only for the current Page. Never use another Page's context.
14. If PAGE_CONTEXT has a system_prompt, tone, sales_goal, product_context, faq_context, allowed_topics or fallback_message, obey it when it does not conflict with the safety rules above.

Sales flow:
Greeting/discovery -> project type -> area/scope -> interior/exterior/product need -> recommend product -> price/objection -> purchase intent -> phone capture -> qualified lead -> handoff when needed.

Return valid JSON only. Required fields:
reply, intent, lead_score, qualification_stage, should_request_phone, should_handoff, recommendations, extracted_customer_data.
Use extracted_customer_data for name, phone, normalized_phone, location, area, floors, project_type, interior_exterior, product_interest and budget.
Valid qualification_stage values: discovery, qualifying, ready_for_quote, phone_capture, handoff, closed.
No markdown.

RETRIEVED_PRODUCTS:
${productLines}

PAGE_CONTEXT:
${pageFactBlock(pageContext)}`;
}
