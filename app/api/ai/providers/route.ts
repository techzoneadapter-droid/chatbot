import { NextResponse } from "next/server";
import { getProviderStatusAsync, resolvePageAIConfigAsync } from "@/lib/ai/config";
import { isSupportedAIModel } from "@/lib/ai/models";
import { MetaProvider } from "@/lib/ai/meta-provider";
import { GeminiProvider, OpenAIProvider } from "@/lib/ai/providers";
import type { AIProviderName } from "@/lib/types";

type TestProvider = AIProviderName | "meta";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: await getProviderStatusAsync() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { provider?: TestProvider; model?: string };
  if (body.provider !== "openai" && body.provider !== "gemini" && body.provider !== "meta") {
    return NextResponse.json({ error: "Nha cung cap AI khong hop le" }, { status: 400 });
  }

  const requestedModel = body.model?.trim();
  if (body.provider === "meta") {
    if (!requestedModel && !process.env.META_MODEL?.trim()) {
      return NextResponse.json({ ok: false, provider: "meta", error: "Vui long nhap Model ID cua Meta Model API" }, { status: 400 });
    }
  } else if (requestedModel && !isSupportedAIModel(body.provider, requestedModel)) {
    return NextResponse.json({ ok: false, provider: body.provider, model: requestedModel, error: "Model khong hop le voi provider da chon" }, { status: 400 });
  }

  const status = await getProviderStatusAsync();
  if (!status[body.provider]) {
    const providerName = body.provider === "meta" ? "Meta Model API" : body.provider === "openai" ? "OpenAI" : "Gemini";
    return NextResponse.json({ ok: false, provider: body.provider, error: `${providerName} chua duoc cau hinh` }, { status: 400 });
  }

  const start = Date.now();
  const pageContext = {
    page_id: "provider-test",
    page_name: "Provider Test",
    ai_provider: body.provider === "meta" ? null : body.provider,
    ai_model: requestedModel ?? null,
    ai_fallback_provider: null,
    ai_provider_fallback_enabled: false,
    ai_business_name: "SalesBot AI",
    ai_system_prompt: "Ban la tro ly kiem tra ket noi.",
    ai_tone: "ngan gon",
    ai_sales_goal: "kiem tra",
    ai_product_context: "",
    ai_faq_context: "",
    ai_allowed_topics: "",
    ai_fallback_message: ""
  };

  let model = requestedModel || "";
  if (body.provider === "meta") {
    model ||= process.env.META_MODEL?.trim() || "";
  } else {
    const config = await resolvePageAIConfigAsync(pageContext);
    model ||= config.model;
  }

  try {
    const provider = body.provider === "meta"
      ? new MetaProvider({ throwErrors: true })
      : body.provider === "gemini"
        ? new GeminiProvider({ throwErrors: true })
        : new OpenAIProvider(undefined, { throwErrors: true });
    const reply = await withTimeout(provider.generateCampaignMessage({ goal: "Tra loi dung 1 cau: Ket noi AI thanh cong.", pageContext }, model), 20000);
    if (!reply) {
      return NextResponse.json({ ok: false, provider: body.provider, error: "Khong nhan duoc phan hoi tu AI", model, latencyMs: Date.now() - start }, { status: 502 });
    }
    return NextResponse.json({ ok: true, provider: body.provider, latencyMs: Date.now() - start, model });
  } catch (error) {
    return NextResponse.json({ ok: false, provider: body.provider, error: normalizeProviderError(error, body.provider), model, latencyMs: Date.now() - start }, { status: 502 });
  }
}

function normalizeProviderError(error: unknown, provider: TestProvider) {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|authentication|api key|unauthorized|invalid/i.test(message)) {
    if (provider === "gemini") return "API key Gemini khong hop le";
    if (provider === "meta") return "MODEL_API_KEY cua Meta khong hop le hoac khong co quyen";
    return "API key khong hop le hoac khong co quyen truy cap";
  }
  if (/META_MODEL_NOT_CONFIGURED/i.test(message)) return "Chua nhap Model ID cua Meta";
  if (/404|not found|not_found|model/i.test(message)) return "Model khong ton tai hoac khong ho tro request nay";
  if (/quota|insufficient_quota|billing/i.test(message)) return "Provider het quota hoac chua bat billing";
  if (/429|rate/i.test(message)) return "Provider dang bi rate limit";
  if (/503|unavailable|overload|high demand/i.test(message)) return "Provider dang qua tai tam thoi";
  if (/timeout|timed out|provider_test_timeout|aborted/i.test(message)) return "AI timeout khi kiem tra ket noi";
  if (/network|fetch|ECONN|ENOTFOUND/i.test(message)) return "Loi network khi ket noi provider";
  return "Provider tra loi khi kiem tra ket noi that bai";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("provider_test_timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
