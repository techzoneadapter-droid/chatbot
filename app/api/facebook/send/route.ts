import { NextResponse } from "next/server";
import { getFacebookPage } from "@/lib/admin-data";
import { sendMessengerText } from "@/lib/facebook/messenger";

export async function POST(request: Request) {
  const body = (await request.json()) as { recipientId?: string; text?: string; pageId?: string };
  if (!body.recipientId || !body.text?.trim()) {
    return NextResponse.json({ error: "recipientId and text are required" }, { status: 400 });
  }
  const page = body.pageId ? await getFacebookPage(body.pageId) : null;
  const result = await sendMessengerText(body.recipientId, body.text.trim(), page?.page_access_token);
  return NextResponse.json({ result });
}
