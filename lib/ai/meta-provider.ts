import { getProviderApiKey } from "@/lib/ai/secrets";
import type { SalesEngineInput, SalesEngineOutput, SalesIntent } from "@/lib/types";

const META_MODEL_API_BASE_URL = "https://api.meta.ai/v1";

export class MetaProvider {
  name = "meta" as const;

  constructor(private readonly options: { throwErrors?: boolean } = {}) {}

  async generate(input: SalesEngineInput, model?: string) {
    return this.generateResponse(input, model);
  }

  async generateResponse(input: SalesEngineInput, model?: string): Promise<SalesEngineOutput | null> {
    const raw = await this.generateJson(
      "Bạn là trợ lý bán hàng. Chỉ dùng dữ liệu của Page và hội thoại được cung cấp. Không bịa giá, sản phẩm, khuyến mãi hoặc chính sách. Trả JSON hợp lệ, không markdown.",
      JSON.stringify({
        page_context: input.pageContext ?? null,
        history: input.history.slice(-16).map((message) => ({ role: message.sender_type, content: message.message })),
        state: input.state,
        customer_message: input.customerMessage,
        products: input.retrievedProducts ?? input.products
      }),
      model
    );
    return raw && typeof raw === "object" ? (raw as SalesEngineOutput) : null;
  }

  async generateCampaignMessage(
    input: { goal?: string; segment?: unknown; pageContext?: SalesEngineInput["pageContext"]; template?: string },
    model?: string
  ) {
    return this.generateText(
      "Soạn một tin Messenger bằng tiếng Việt có dấu, ngắn gọn, tự nhiên và không bịa giảm giá/chính sách.",
      JSON.stringify(input),
      model
    );
  }

  async summarizeConversation(input: Pick<SalesEngineInput, "history" | "pageContext">, model?: string) {
    return this.generateText(
      "Tóm tắt hội thoại bán hàng ngắn gọn, chỉ giữ nhu cầu, sản phẩm, cam kết và việc cần làm.",
      JSON.stringify(input),
      model
    );
  }

  async extractLead(input: SalesEngineInput, model?: string) {
    return (await this.generateResponse(input, model))?.extracted ?? null;
  }

  async classifyIntent(input: { message: string }, model?: string): Promise<SalesIntent | "unknown" | null> {
    const raw = await this.generateJson(
      "Phân loại ý định của khách. Chỉ trả JSON dạng {\"intent\":\"unknown\"} hoặc một intent phù hợp.",
      input.message,
      model
    );
    const intent = raw && typeof raw === "object" ? (raw as { intent?: unknown }).intent : null;
    return typeof intent === "string" ? (intent as SalesIntent | "unknown") : null;
  }

  async generatePageReply(system: string, user: string, model?: string) {
    return this.generateText(system, user, model);
  }

  private async generateJson(system: string, user: string, model?: string) {
    const text = await this.generateText(`${system}\nTrả lời bằng JSON hợp lệ, không bọc trong markdown.`, user, model);
    if (!text) return null;
    try {
      return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      return null;
    }
  }

  private async generateText(system: string, user: string, model?: string) {
    const selectedModel = model?.trim() || process.env.META_MODEL?.trim();
    if (!selectedModel) throw new Error("META_MODEL_NOT_CONFIGURED");

    const apiKey = await getProviderApiKey("meta");
    if (!apiKey) throw new Error("MODEL_API_KEY_NOT_CONFIGURED");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const baseUrl = (process.env.META_MODEL_API_BASE_URL?.trim() || META_MODEL_API_BASE_URL).replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature: 0.35
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
        error?: { message?: string; type?: string; code?: string | number } | string;
        message?: string;
      };

      if (!response.ok) {
        const detail = typeof payload.error === "string"
          ? payload.error
          : payload.error?.message || payload.message || payload.error?.type || "Unknown error";
        throw new Error(`Meta Model API HTTP ${response.status}: ${detail}`);
      }

      const content = payload.choices?.[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text ?? "").join("")
          : "";
      return text.trim() || null;
    } catch (error) {
      console.error("[ai] Meta Model API provider failed", error instanceof Error ? error.message : error);
      if (this.options.throwErrors) throw error;
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
