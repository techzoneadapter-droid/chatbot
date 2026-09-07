import { NextResponse } from "next/server";
import { FacebookGraphApiError } from "@/lib/facebook/oauth";
import { syncMessengerConversations } from "@/lib/facebook/conversation-sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { page_id?: string | null; cursor?: string | null; limit?: number };
  try {
    const result = await syncMessengerConversations({ pageId: body.page_id ?? null, cursor: body.cursor ?? null, limit: body.limit });
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (error) {
    const message =
      error instanceof FacebookGraphApiError
        ? `Graph API error ${error.code ?? error.status}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Cannot sync Messenger conversations";
    return NextResponse.json({ ok: false, next_cursor: null, has_more: false, limit: 0, scanned_conversations: 0, found_conversations: 0, imported_conversations: 0, updated_conversations: 0, imported_messages: 0, duplicate_messages: 0, errors: [message] }, { status: 502 });
  }
}
