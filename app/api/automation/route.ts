import { NextResponse } from "next/server";
import { getAutomationSettings, saveAutomationSettings } from "@/lib/admin-data";

export async function GET() {
  return NextResponse.json({ settings: await getAutomationSettings() });
}

export async function POST(request: Request) {
  const current = await getAutomationSettings();
  const body = await request.json();
  const settings = {
    ...current,
    ...body,
    messenger: { ...current.messenger, ...(body.messenger ?? {}) },
    comment: { ...current.comment, ...(body.comment ?? {}) },
    blacklistKeywords: Array.isArray(body.blacklistKeywords) ? body.blacklistKeywords.map(String).filter(Boolean) : current.blacklistKeywords,
    handoffRules: Array.isArray(body.handoffRules) ? body.handoffRules.map(String).filter(Boolean) : current.handoffRules,
    maxConsecutiveBotReplies: Number(body.maxConsecutiveBotReplies ?? current.maxConsecutiveBotReplies)
  };
  return NextResponse.json({ settings: await saveAutomationSettings(settings) });
}
