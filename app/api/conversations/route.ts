import { NextResponse } from "next/server";
import { getFacebookPage, listFacebookPages } from "@/lib/admin-data";
import { getProviderStatusAsync } from "@/lib/ai/config";
import { FacebookGraphApiError } from "@/lib/facebook/oauth";
import { sendMessengerText } from "@/lib/facebook/messenger";
import { createChatRepository } from "@/lib/storage/chat-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repository = createChatRepository();
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 50)));
  const conversationId = url.searchParams.get("conversation_id");

  if (conversationId) {
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");
    return NextResponse.json({ messages: await repository.getMessages(conversationId, { limit, before, after }) });
  }

  const pageId = url.searchParams.get("page_id");
  const [pages, providerStatus] = await Promise.all([listFacebookPages(), getProviderStatusAsync()]);
  const pageMap = new Map(pages.map((page) => [page.page_id, page]));
  const conversations = await repository.listConversations({
    limit,
    cursor: url.searchParams.get("cursor"),
    after: url.searchParams.get("after"),
    search: url.searchParams.get("q"),
    pageId: pageId && pageId !== "all" ? pageId : null,
    messageLimit: 0
  });

  return NextResponse.json({
    providerStatus,
    pages,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      page: conversation.page_id ? pageMap.get(conversation.page_id) ?? null : null
    })),
    nextCursor: conversations.length === limit ? conversations[conversations.length - 1]?.last_message_at ?? conversations[conversations.length - 1]?.updated_at ?? null : null
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; ai_enabled?: boolean; human_takeover?: boolean; unread_count?: number };
  if (!body.id) return NextResponse.json({ error: "Thiếu ID hội thoại" }, { status: 400 });
  const repository = createChatRepository();
  let conversation = null;
  if (typeof body.human_takeover === "boolean") {
    conversation = await repository.setHumanTakeover(body.id, body.human_takeover);
  } else if (typeof body.ai_enabled === "boolean") {
    conversation = await repository.setAiEnabled(body.id, body.ai_enabled);
  } else if (typeof body.unread_count === "number") {
    conversation = await repository.updateConversation(body.id, { unread_count: Math.max(0, Math.floor(body.unread_count)) });
  } else {
    return NextResponse.json({ error: "Thiếu trạng thái AI hoặc nhân viên tiếp quản" }, { status: 400 });
  }
  if (!conversation) return NextResponse.json({ error: "Không tìm thấy hội thoại" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { conversation_id?: string; text?: string };
  const text = body.text?.trim();
  if (!body.conversation_id || !text) return NextResponse.json({ error: "Thiếu hội thoại hoặc nội dung tin nhắn" }, { status: 400 });
  const repository = createChatRepository();
  const conversation = await repository.getConversationById(body.conversation_id);
  if (!conversation) return NextResponse.json({ error: "Không tìm thấy hội thoại" }, { status: 404 });
  if (!conversation.page_id || !conversation.customer_psid) return NextResponse.json({ error: "Hội thoại thiếu Facebook Page hoặc PSID khách hàng" }, { status: 400 });
  const page = await getFacebookPage(conversation.page_id);
  if (!page?.page_access_token) return NextResponse.json({ error: "Page Token bị thiếu hoặc đã hết hạn" }, { status: 400 });

  try {
    const result = await sendMessengerText(conversation.customer_psid, text, page.page_access_token);
    const message = await repository.addMessage(conversation.id, "staff", text, { pageId: conversation.page_id, messenger_result: result });
    if (page.auto_handoff !== false) await repository.setHumanTakeover(conversation.id, true);
    return NextResponse.json({ message, result });
  } catch (error) {
    const failedMessage = await repository.addMessage(conversation.id, "staff", text, { pageId: conversation.page_id, status: "failed", send_error: safeGraphError(error) });
    return NextResponse.json({ error: "Messenger gửi thất bại", message: failedMessage, graphError: safeGraphError(error) }, { status: 502 });
  }
}

function safeGraphError(error: unknown) {
  if (error instanceof FacebookGraphApiError) {
    return { status: error.status, code: error.code ?? null, error_subcode: error.error_subcode ?? null, message: error.message };
  }
  return { message: error instanceof Error ? error.message : "Unknown error" };
}
