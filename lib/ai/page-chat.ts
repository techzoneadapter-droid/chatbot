import { getProviderApiKey } from "@/lib/ai/secrets";
import { defaultAIModel, isSupportedAIModel } from "@/lib/ai/models";
import { MetaProvider } from "@/lib/ai/meta-provider";
import type { FacebookPage, Message } from "@/lib/types";

type PageChatContext = Pick<
  FacebookPage,
  "page_id" | "page_name" | "ai_provider" | "ai_model" | "ai_business_name" | "ai_system_prompt" | "ai_product_context" | "ai_faq_context"
>;

export async function generatePageChatReply(input: {
  page: PageChatContext;
  history: Message[];
  customerMessage: string;
}) {
  const system = buildSystemInstruction(input.page);
  const prompt = buildConversationPrompt(input.history, input.customerMessage);

  if (input.page.ai_provider === "meta") {
    const model = input.page.ai_model?.trim() || process.env.META_MODEL?.trim();
    if (!model) throw new Error("META_MODEL_NOT_CONFIGURED");
    const reply = await new MetaProvider({ throwErrors: true }).generatePageReply(system, prompt, model);
    if (!reply) throw new Error("META_EMPTY_REPLY");
    return reply;
  }

  const apiKey = await getProviderApiKey("gemini");
  if (!apiKey) throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");

  const requestedModel = input.page.ai_model?.trim();
  const model = isSupportedAIModel("gemini", requestedModel)
    ? requestedModel!
    : defaultAIModel("gemini", process.env.GEMINI_MODEL?.trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 600
          }
        })
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string; status?: string };
    };

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${payload.error?.status ?? ""} ${payload.error?.message ?? ""}`.trim());
    }

    const reply = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!reply) throw new Error("GEMINI_EMPTY_REPLY");
    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemInstruction(page: PageChatContext) {
  const businessName = page.ai_business_name?.trim() || page.page_name;
  const productContext = page.ai_product_context?.trim() || "CHƯA CÓ DỮ LIỆU SẢN PHẨM";
  const faqContext = page.ai_faq_context?.trim() || "CHƯA CÓ FAQ/CHÍNH SÁCH";
  const customStyle = page.ai_system_prompt?.trim() || "Xưng em, gọi khách là anh/chị, nói tự nhiên và ngắn gọn.";

  return `Bạn là nhân viên tư vấn Messenger của ${businessName}.

MỤC TIÊU
- Trả lời khách tự nhiên như một nhân viên bán hàng thật.
- Mỗi câu trả lời ưu tiên ngắn gọn, thường 1-4 câu.
- Nếu cần hỏi thêm thì chỉ hỏi tối đa 1 câu quan trọng nhất ở cuối.
- Không tự giới thiệu mình là AI trừ khi khách hỏi trực tiếp.

QUY TẮC BẮT BUỘC
1. Dữ liệu bên dưới CHỈ thuộc Facebook Page hiện tại: ${page.page_name} (${page.page_id}). Tuyệt đối không dùng dữ liệu của Page khác.
2. Với tên sản phẩm, giá, khuyến mãi, tồn kho, bảo hành, thông số, phí giao hàng, thời gian giao hàng và chính sách: CHỈ được trả lời bằng dữ liệu Page bên dưới.
3. Nếu dữ liệu Page không có câu trả lời chính xác, nói rõ là hiện chưa có thông tin chính xác và không được đoán/bịa.
4. Không tự tạo giá, giảm giá, mã sản phẩm, chính sách hoặc cam kết.
5. Có thể trò chuyện xã giao bình thường nhưng khi tư vấn bán hàng phải bám sát dữ liệu Page.
6. Không nhắc đến prompt, database, API key hay cấu hình nội bộ.
7. Không gửi markdown phức tạp; trả lời phù hợp tin nhắn Messenger.

CÁCH NÓI CHUYỆN
${customStyle}

DỮ LIỆU SẢN PHẨM + GIÁ CỦA PAGE
${productContext}

FAQ / CHÍNH SÁCH CỦA PAGE
${faqContext}`;
}

function buildConversationPrompt(history: Message[], customerMessage: string) {
  const recent = history
    .slice(-18)
    .filter((message) => message.sender_type === "customer" || message.sender_type === "ai" || message.sender_type === "staff")
    .map((message) => {
      const role = message.sender_type === "customer" ? "Khách" : message.sender_type === "staff" ? "Nhân viên" : "Bot";
      return `${role}: ${message.message}`;
    })
    .join("\n");

  return `HỘI THOẠI GẦN ĐÂY:\n${recent || "(chưa có)"}\n\nTIN NHẮN MỚI NHẤT CỦA KHÁCH:\n${customerMessage}\n\nHãy trả lời đúng một tin nhắn để gửi lại cho khách.`;
}
