import OpenAI from "openai";
import { z } from "zod";
import { getAIConfig, resolvePageAIConfigAsync } from "@/lib/ai/config";
import { getProviderApiKey } from "@/lib/ai/secrets";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { AIProviderName, SalesEngineInput, SalesEngineOutput, SalesIntent } from "@/lib/types";

export interface AIProvider {
  name: AIProviderName | "local_fallback";
  generate?(input: SalesEngineInput, model?: string): Promise<SalesEngineOutput | null>;
  generateResponse(input: SalesEngineInput, model?: string): Promise<SalesEngineOutput | null>;
  generateCampaignMessage(input: { goal?: string; segment?: unknown; pageContext?: SalesEngineInput["pageContext"]; template?: string }, model?: string): Promise<string | null>;
  summarizeConversation(input: Pick<SalesEngineInput, "history" | "pageContext">, model?: string): Promise<string | null>;
  extractLead(input: SalesEngineInput, model?: string): Promise<SalesEngineOutput["extracted"] | null>;
  classifyIntent(input: { message: string; pageContext?: SalesEngineInput["pageContext"] }, model?: string): Promise<SalesIntent | "unknown" | null>;
}

const intentSchema = z.enum([
  "greeting",
  "product_question",
  "price_inquiry",
  "quotation_request",
  "color_question",
  "coverage_question",
  "technical_question",
  "interior_paint",
  "exterior_paint",
  "waterproofing",
  "new_house",
  "renovation",
  "dealer_question",
  "delivery_question",
  "discount_question",
  "purchase_intent",
  "phone_provided",
  "address_provided",
  "quantity_provided",
  "contractor_question",
  "human_request",
  "complaint",
  "unknown"
]);

const extractedSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    normalized_phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    quantity: z.union([z.string(), z.number()]).nullable().optional(),
    area: z.union([z.string(), z.number()]).nullable().optional(),
    floors: z.union([z.string(), z.number()]).nullable().optional(),
    project_type: z.string().nullable().optional(),
    interior_exterior: z.string().nullable().optional(),
    budget: z.string().nullable().optional(),
    product_interest: z.string().nullable().optional()
  })
  .default({});

const outputSchema = z.object({
  reply: z.string().min(1),
  intent: intentSchema,
  lead_score: z.number().min(0).max(100),
  qualification_stage: z.enum(["discovery", "qualifying", "ready_for_quote", "phone_capture", "handoff", "closed"]),
  should_request_phone: z.boolean(),
  should_handoff: z.boolean(),
  next_action: z.enum(["reply", "ask_phone", "ask_address", "ask_quantity", "confirm_order", "create_order", "handoff", "none"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  scored_signals: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).default([]),
  extracted_customer_data: extractedSchema.optional(),
  extracted: extractedSchema.optional()
});

function stringifyNullable(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

export function normalizeAIOutput(raw: unknown, provider?: SalesEngineOutput["provider"]): SalesEngineOutput {
  const parsed = outputSchema.parse(raw);
  const extracted = parsed.extracted ?? parsed.extracted_customer_data ?? {};
  const normalized = {
    name: extracted.name ?? null,
    phone: extracted.phone ?? null,
    normalized_phone: extracted.normalized_phone ?? null,
    location: extracted.location ?? null,
    address: extracted.address ?? null,
    quantity: stringifyNullable(extracted.quantity),
    area: stringifyNullable(extracted.area),
    floors: stringifyNullable(extracted.floors),
    project_type: extracted.project_type ?? null,
    budget: extracted.budget ?? null,
    product_interest: extracted.product_interest ?? extracted.interior_exterior ?? null
  };
  const confidence = parsed.confidence ?? 0.7;
  return {
    reply: parsed.reply,
    intent: parsed.intent as SalesIntent,
    lead_score: parsed.lead_score,
    qualification_stage: parsed.qualification_stage,
    should_request_phone: parsed.should_request_phone,
    should_handoff: parsed.should_handoff,
    next_action: parsed.next_action,
    confidence,
    confidence_status: parsed.should_handoff ? "human_required" : confidence < 0.55 ? "uncertain" : "confident",
    provider,
    scored_signals: parsed.scored_signals,
    recommendations: parsed.recommendations,
    extracted: normalized,
    extracted_customer_data: normalized
  };
}

function responsePrompt(input: SalesEngineInput) {
  return JSON.stringify({
    rules: [
      "Chỉ dùng đúng page_context, conversation, history và sản phẩm được gửi trong payload.",
      "Không lấy dữ liệu Page khác hoặc hội thoại khác.",
      "Nếu hỏi giá mà không có giá trong retrieved_products/page_context, trả lời cần nhân viên kiểm tra, không đoán.",
      "Nếu đã có SĐT/địa chỉ/số lượng trong state thì không hỏi lại.",
      "Trả JSON đúng schema, tiếng Việt có dấu, ngắn gọn."
    ],
    conversation: { id: input.conversation.id, page_id: input.conversation.page_id, customer_psid: input.conversation.customer_psid },
    history: input.history.slice(-16).map((message) => ({ role: message.sender_type, content: message.message, at: message.created_at })),
    state: input.state,
    customer_message: input.customerMessage,
    retrieved_products: input.retrievedProducts ?? input.products,
    page_context: input.pageContext ?? null
  });
}

export class OpenAIProvider implements AIProvider {
  name = "openai" as const;

  constructor(
    private readonly clientFactory: (apiKey: string) => Pick<OpenAI, "chat"> = (apiKey) => new OpenAI({ apiKey }),
    private readonly options: { throwErrors?: boolean } = {}
  ) {}

  async generate(input: SalesEngineInput, model?: string) {
    return this.generateResponse(input, model);
  }

  async generateResponse(input: SalesEngineInput, model?: string) {
    const config = getAIConfig();
    const apiKey = await getProviderApiKey("openai");
    if (!apiKey) return null;
    try {
      const client = this.clientFactory(apiKey);
      const completion = await client.chat.completions.create({
        model: model ?? config.defaultOpenAIModel,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(input.retrievedProducts ?? input.products, input.pageContext) },
          { role: "user", content: responsePrompt(input) }
        ],
        temperature: 0.35
      });
      const raw = completion.choices[0]?.message.content;
      return raw ? normalizeAIOutput(JSON.parse(raw), this.name) : null;
    } catch (error) {
      console.error("[ai] OpenAI provider failed", error instanceof Error ? error.message : error);
      if (this.options.throwErrors) throw error;
      return null;
    }
  }

  async generateCampaignMessage(input: { goal?: string; segment?: unknown; pageContext?: SalesEngineInput["pageContext"]; template?: string }, model?: string) {
    const config = getAIConfig();
    const apiKey = await getProviderApiKey("openai");
    if (!apiKey) return null;
    const client = this.clientFactory(apiKey);
    const completion = await client.chat.completions.create({
      model: model ?? config.defaultOpenAIModel,
      messages: [
        { role: "system", content: "Soạn một tin Messenger chăm sóc khách bằng tiếng Việt có dấu, ngắn gọn, không bịa giảm giá/chính sách. Giữ placeholder {{name}}, {{page_name}}, {{product}} khi hữu ích." },
        { role: "user", content: JSON.stringify(input) }
      ],
      temperature: 0.45
    });
    return completion.choices[0]?.message.content?.trim() || null;
  }

  async summarizeConversation(input: Pick<SalesEngineInput, "history" | "pageContext">, model?: string) {
    const config = getAIConfig();
    const apiKey = await getProviderApiKey("openai");
    if (!apiKey) return null;
    const client = this.clientFactory(apiKey);
    const completion = await client.chat.completions.create({
      model: model ?? config.defaultOpenAIModel,
      messages: [
        { role: "system", content: "Tóm tắt hội thoại bán hàng trong 5 gạch đầu dòng, chỉ giữ nhu cầu, lead, sản phẩm, cam kết và việc cần làm." },
        { role: "user", content: JSON.stringify(input) }
      ],
      temperature: 0.2
    });
    return completion.choices[0]?.message.content?.trim() || null;
  }

  async extractLead(input: SalesEngineInput, model?: string) {
    return (await this.generateResponse(input, model))?.extracted ?? null;
  }

  async classifyIntent(input: { message: string }, model?: string) {
    const config = getAIConfig();
    const apiKey = await getProviderApiKey("openai");
    if (!apiKey) return null;
    const client = this.clientFactory(apiKey);
    const completion = await client.chat.completions.create({
      model: model ?? config.defaultOpenAIModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Phân loại intent. Chỉ trả JSON {"intent": "..."} với intent thuộc: ${intentSchema.options.join(", ")}` },
        { role: "user", content: input.message }
      ],
      temperature: 0
    });
    const raw = completion.choices[0]?.message.content;
    if (!raw) return null;
    return intentSchema.catch("unknown").parse(JSON.parse(raw).intent);
  }
}

export class GeminiProvider implements AIProvider {
  name = "gemini" as const;

  constructor(private readonly options: { throwErrors?: boolean } = {}) {}

  async generate(input: SalesEngineInput, model?: string) {
    return this.generateResponse(input, model);
  }

  async generateResponse(input: SalesEngineInput, model?: string) {
    const raw = await this.generateJson(buildSystemPrompt(input.retrievedProducts ?? input.products, input.pageContext), responsePrompt(input), model);
    return raw ? normalizeAIOutput(raw, this.name) : null;
  }

  async generateCampaignMessage(input: { goal?: string; segment?: unknown; pageContext?: SalesEngineInput["pageContext"]; template?: string }, model?: string) {
    return this.generateText("Soạn một tin Messenger chăm sóc khách bằng tiếng Việt có dấu, ngắn gọn, không bịa giảm giá/chính sách. Giữ placeholder khi hữu ích.", JSON.stringify(input), model);
  }

  async summarizeConversation(input: Pick<SalesEngineInput, "history" | "pageContext">, model?: string) {
    return this.generateText("Tóm tắt hội thoại bán hàng trong 5 gạch đầu dòng, chỉ giữ nhu cầu, lead, sản phẩm, cam kết và việc cần làm.", JSON.stringify(input), model);
  }

  async extractLead(input: SalesEngineInput, model?: string) {
    return (await this.generateResponse(input, model))?.extracted ?? null;
  }

  async classifyIntent(input: { message: string }, model?: string) {
    const raw = await this.generateJson(`Phân loại intent. Chỉ trả JSON {"intent": "..."} với intent thuộc: ${intentSchema.options.join(", ")}`, input.message, model);
    return raw ? intentSchema.catch("unknown").parse((raw as { intent?: unknown }).intent) : null;
  }

  private async generateText(system: string, user: string, model?: string) {
    const data = await this.request(system, user, model, false);
    return data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim() || null;
  }

  private async generateJson(system: string, user: string, model?: string) {
    const data = await this.request(`${system}\nTrả lời bằng JSON hợp lệ, không markdown.`, user, model, true);
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
    if (!text) return null;
    try {
      return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      return null;
    }
  }

  private async request(system: string, user: string, model?: string, jsonMode = false) {
    const config = getAIConfig();
    const apiKey = await getProviderApiKey("gemini");
    if (!apiKey) return null;
    try {
      const selectedModel = model ?? config.defaultGeminiModel;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: jsonMode ? { temperature: 0.35, responseMimeType: "application/json" } : { temperature: 0.35 }
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
        throw new Error(`Gemini HTTP ${response.status}: ${payload.error?.status ?? ""} ${payload.error?.message ?? ""}`.trim());
      }
      return (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    } catch (error) {
      console.error("[ai] Gemini provider failed", error instanceof Error ? error.message : error);
      if (this.options.throwErrors) throw error;
      return null;
    }
  }
}

export class LocalFallbackProvider implements AIProvider {
  name = "local_fallback" as const;

  constructor(private readonly handler: (input: SalesEngineInput) => SalesEngineOutput) {}

  async generate(input: SalesEngineInput) {
    return this.generateResponse(input);
  }

  async generateResponse(input: SalesEngineInput) {
    return { ...this.handler(input), provider: this.name };
  }

  async generateCampaignMessage() {
    return null;
  }

  async summarizeConversation() {
    return null;
  }

  async extractLead(input: SalesEngineInput) {
    return this.handler(input).extracted;
  }

  async classifyIntent() {
    return null;
  }
}

export function createProvider(provider: AIProviderName): AIProvider {
  return provider === "gemini" ? new GeminiProvider() : new OpenAIProvider();
}

export async function generateWithPageProvider(input: SalesEngineInput, localHandler: (input: SalesEngineInput) => SalesEngineOutput) {
  const pageConfig = await resolvePageAIConfigAsync(input.pageContext);
  const primary = await createProvider(pageConfig.provider).generateResponse(input, pageConfig.model);
  if (primary) return primary;
  if (pageConfig.fallbackEnabled && pageConfig.fallbackProvider) {
    const fallback = await createProvider(pageConfig.fallbackProvider).generateResponse(input);
    if (fallback) return fallback;
  }
  return new LocalFallbackProvider(localHandler).generateResponse(input);
}
