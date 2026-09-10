import { NextResponse } from "next/server";
import { getProviderStatusAsync } from "@/lib/ai/config";
import { deleteProviderApiKey, saveProviderApiKey } from "@/lib/ai/secrets";
import type { AIProviderName } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: await getProviderStatusAsync() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { provider?: AIProviderName; apiKey?: string };
  if (body.provider !== "openai" && body.provider !== "gemini" && body.provider !== "meta") {
    return NextResponse.json({ error: "Nhà cung cấp AI không hợp lệ" }, { status: 400 });
  }
  const apiKey = body.apiKey?.trim();
  if (!apiKey) return NextResponse.json({ error: "Vui lòng nhập API key" }, { status: 400 });

  try {
    await saveProviderApiKey(body.provider, apiKey);
    return NextResponse.json({ ok: true, providers: await getProviderStatusAsync() });
  } catch (error) {
    return NextResponse.json({ error: secretStoreError(error, "Không lưu được API key") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== "openai" && provider !== "gemini" && provider !== "meta") {
    return NextResponse.json({ error: "Nhà cung cấp AI không hợp lệ" }, { status: 400 });
  }

  try {
    await deleteProviderApiKey(provider);
    return NextResponse.json({ ok: true, providers: await getProviderStatusAsync() });
  } catch (error) {
    return NextResponse.json({ error: secretStoreError(error, "Không xóa được API key") }, { status: 500 });
  }
}

function secretStoreError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.includes("Encrypted secret store")
    ? "Chưa cấu hình khóa mã hóa hệ thống"
    : fallback;
}
