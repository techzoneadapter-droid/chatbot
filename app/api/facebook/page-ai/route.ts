import { NextResponse } from "next/server";
import { getFacebookPage, upsertFacebookPage } from "@/lib/admin-data";
import type { AIProviderName } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = typeof body.page_id === "string" ? body.page_id.trim() : "";
  if (!pageId) return NextResponse.json({ error: "Missing Page ID" }, { status: 400 });

  const existing = await getFacebookPage(pageId);
  if (!existing) return NextResponse.json({ error: "Page chưa được kết nối" }, { status: 404 });

  const requestedProvider = body.ai_provider;
  const provider: AIProviderName = requestedProvider === "meta" ? "meta" : "gemini";
  const model = typeof body.ai_model === "string" ? body.ai_model.trim() : "";
  if (provider === "meta" && !model && !process.env.META_MODEL?.trim()) {
    return NextResponse.json({ error: "Meta Model API cần Model ID" }, { status: 400 });
  }

  try {
    const page = await upsertFacebookPage(
      {
        ...existing,
        page_id: pageId,
        page_name: typeof body.page_name === "string" && body.page_name.trim() ? body.page_name.trim() : existing.page_name,
        automation_enabled: typeof body.automation_enabled === "boolean" ? body.automation_enabled : existing.automation_enabled,
        auto_reply_messenger: typeof body.auto_reply_messenger === "boolean" ? body.auto_reply_messenger : existing.auto_reply_messenger,
        ai_sales_mode: typeof body.ai_sales_mode === "boolean" ? body.ai_sales_mode : existing.ai_sales_mode,
        auto_handoff: false,
        ai_provider: provider,
        ai_model: model || (provider === "gemini" ? "gemini-3.8-flash" : process.env.META_MODEL?.trim() || null),
        ai_provider_fallback_enabled: false,
        ai_fallback_provider: null,
        ai_business_name: typeof body.ai_business_name === "string" ? body.ai_business_name : existing.ai_business_name,
        ai_system_prompt: typeof body.ai_system_prompt === "string" ? body.ai_system_prompt : existing.ai_system_prompt,
        ai_product_context: typeof body.ai_product_context === "string" ? body.ai_product_context : existing.ai_product_context,
        ai_faq_context: typeof body.ai_faq_context === "string" ? body.ai_faq_context : existing.ai_faq_context
      },
      { throwOnSupabaseError: true }
    );
    return NextResponse.json({ ok: true, page });
  } catch {
    return NextResponse.json({ error: "Không lưu được cấu hình AI của Page" }, { status: 500 });
  }
}
