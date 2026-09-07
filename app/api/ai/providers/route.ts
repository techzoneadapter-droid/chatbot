import { NextResponse } from "next/server";
import { getProviderStatusAsync, resolvePageAIConfigAsync } from "@/lib/ai/config";
import { isSupportedAIModel } from "@/lib/ai/models";
import { GeminiProvider, OpenAIProvider } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: await getProviderStatusAsync() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { provider?: "openai" | "gemini"; model?: string };
  if (body.provider !== "openai" && body.provider !== "gemini") {
    return NextResponse.json({ error: "Nha cung cap AI khong hop le" }, { status: 400 });
  }
  if (body.model && !isSupportedAIModel(body.provider, body.model)) {
    return NextResponse.json({ ok: false, provider: body.provider, model: body.model, error: "Model khong hop le voi provider da chon" }, { status: 400 });
  }

  const status = await getProviderStatusAsync();
  if (!status[body.provider]) {
    return NextResponse.json({ ok: false, provider: body.provider, error: `${body.provider === "openai" ? "OpenAI" : "Gemini"} chua duoc cau hinh` }, { status: 400 });
  }

  const start = Date.now();
  const pageContext = {
    page_id: "provider-test",
    page_name: "Provider Test",
    ai_provider: body.provider,
    ai_model: body.model ?? null,
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
  const config = await resolvePageAIConfigAsync(pageContext);
  const model = body.model ?? config.model;

  try {
    const provider = body.provider === "gemini" ? new GeminiProvider({ throwErrors: true }) : new OpenAIProvider(undefined, { throwErrors: true });
    const reply = await withTimeout(provider.generateCampaignMessage({ goal: "Tra loi dung 1 cau: Ket noi AI thanh cong.", pageContext }, model), 12000);
    if (!reply) {
      return NextResponse.json({ ok: false, provider: body.provider, error: "Khong nhan duoc phan hoi tu AI", model, latencyMs: Date.now() - start }, { status: 502 });
    }
    return NextResponse.json({ ok: true, provider: body.provider, latencyMs: Date.now() - start, model });
  } catch (error) {
    return NextResponse.json({ ok: false, provider: body.provider, error: normalizeProviderError(error), model, latencyMs: Date.now() - start }, { status: 502 });
  }
}

function normalizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|authentication|api key|unauthorized|invalid/i.test(message)) return /gemini/i.test(message) ? "API key Gemini khong hop le" : "API key khong hop le hoac khong co quyen truy cap";
  if (/404|not found|not_found|model/i.test(message)) return "Model khong ton tai hoac khong ho tro request nay";
  if (/quota|insufficient_quota|billing/i.test(message)) return "Provider het quota hoac chua bat billing";
  if (/429|rate/i.test(message)) return "Provider dang bi rate limit";
  if (/503|unavailable|overload|high demand/i.test(message)) return "Provider dang qua tai tam thoi";
  if (/timeout|timed out|provider_test_timeout/i.test(message)) return "AI timeout khi kiem tra ket noi";
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
