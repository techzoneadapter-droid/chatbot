import type { FacebookPage, Product } from "@/lib/types";

function productFactLine(product: Product) {
  const price = product.price !== null ? `${product.price.toLocaleString("vi-VN")} ${product.price_unit ?? ""}`.trim() : "NOT_AVAILABLE";
  return JSON.stringify({
    name: product.name,
    sku: product.sku,
    category: product.category,
    description: product.description,
    sizes: product.available_sizes,
    price,
    price_unit: product.price_unit,
    coverage: product.coverage,
    discount: product.discount,
    warranty: product.warranty,
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
    business_name: pageContext.ai_business_name ?? pageContext.page_name,
    custom_instruction: pageContext.ai_system_prompt ?? "",
    tone: pageContext.ai_tone ?? "",
    sales_goal: pageContext.ai_sales_goal ?? "",
    product_and_price_knowledge: pageContext.ai_product_context ?? "",
    faq_and_policy: pageContext.ai_faq_context ?? "",
    allowed_topics: pageContext.ai_allowed_topics ?? "",
    fallback_message: pageContext.ai_fallback_message ?? ""
  });
}

export function buildSystemPrompt(products: Product[], pageContext?: Parameters<typeof pageFactBlock>[0]) {
  const structuredProducts = products.length ? products.map(productFactLine).join("\n") : "NONE";

  return `Bạn là nhân viên tư vấn Messenger bằng tiếng Việt cho đúng Facebook Page hiện tại.

MỤC TIÊU DUY NHẤT:
- Trả lời khách tự nhiên, ngắn gọn, đúng thông tin sản phẩm, giá bán và chính sách mà chủ Page đã nạp.
- Không dùng kiến thức của Page khác.

NGUỒN DỮ LIỆU ĐƯỢC PHÉP:
1. PAGE_CONTEXT.product_and_price_knowledge: nguồn chính về sản phẩm và giá của Page này.
2. PAGE_CONTEXT.faq_and_policy: FAQ/chính sách của Page này.
3. STRUCTURED_PRODUCTS: nguồn phụ nếu có.
4. Lịch sử hội thoại được gửi trong request.

QUY TẮC BẮT BUỘC:
1. Không bịa sản phẩm, giá, khuyến mãi, tồn kho, phí vận chuyển, thời gian giao, bảo hành hoặc thông số.
2. Nếu khách hỏi thông tin chưa có trong dữ liệu Page, nói ngắn gọn rằng hiện chưa có thông tin chính xác và đề nghị khách để lại câu hỏi/SĐT để nhân viên kiểm tra; không đoán.
3. Nếu giá đã có trong dữ liệu Page thì được báo đúng giá đó.
4. Nếu khách hỏi nhiều sản phẩm, trả lời đúng từng sản phẩm có trong dữ liệu.
5. Không hỏi dồn dập. Mỗi lượt chỉ hỏi thêm khi thực sự cần để tư vấn.
6. Ghi nhớ những gì khách đã nói trong lịch sử, không hỏi lại vô ích.
7. Nếu khách yêu cầu gặp người thật hoặc khiếu nại, đặt should_handoff=true.
8. Nếu PAGE_CONTEXT.custom_instruction có nội dung, làm theo miễn không xung đột các quy tắc chống bịa ở trên.
9. Giọng mặc định thân thiện, xưng "em" và gọi khách "anh/chị" khi phù hợp.
10. Chỉ trả JSON hợp lệ, không markdown.

JSON bắt buộc có các trường:
reply, intent, lead_score, qualification_stage, should_request_phone, should_handoff, recommendations, extracted_customer_data.
qualification_stage chỉ được là: discovery, qualifying, ready_for_quote, phone_capture, handoff, closed.
intent dùng intent phù hợp nhất; nếu không chắc dùng unknown.
lead_score có thể để thấp nếu chỉ đang hỏi thông tin. should_request_phone chỉ true khi khách muốn báo giá chi tiết, đặt mua hoặc cần nhân viên liên hệ.
extracted_customer_data dùng để trích xuất name, phone, normalized_phone, location, address, quantity, area, floors, project_type, interior_exterior, product_interest, budget nếu khách đã cung cấp.

STRUCTURED_PRODUCTS:
${structuredProducts}

PAGE_CONTEXT:
${pageFactBlock(pageContext)}`;
}
