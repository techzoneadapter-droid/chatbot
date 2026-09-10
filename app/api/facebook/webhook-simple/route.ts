import { NextResponse } from "next/server";
import { generatePageChatReply } from "@/lib/ai/page-chat";
import { getFacebookPage, markWebhookEventProcessed, saveWebhookEvent, upsertFacebookPage } from "@/lib/admin-data";
import { sendMessengerText } from "@/lib/facebook/messenger";
import { normalizeWebhookBody, verifyMetaSignature, verifyWebhook } from "@/lib/facebook/webhook";
import type { MessengerWebhookBody } from "@/lib/facebook/types";
import { createChatRepository } from "@/lib/storage/chat-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challenge = verifyWebhook(
    searchParams.get("hub.mode"),
    searchParams.get("hub.verify_token"),
    searchParams.get("hub.challenge")
  );
  return challenge ? new NextResponse(challenge, { status: 200 }) : new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 403 });
  }

  let body: MessengerWebhookBody;
  try {
    body = JSON.parse(rawBody) as MessengerWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const events = normalizeWebhookBody(body).filter((event) => event.type === "message" && event.shouldTriggerAI);
  if (!events.length) return NextResponse.json({ ok: true, received: 0, replied: 0 });

  const repository = createChatRepository();
  let replied = 0;

  for (const event of events) {
    if (event.type !== "message") continue;

    const logged = await saveWebhookEvent({
      event_key: event.eventKey,
      page_id: event.pageId,
      event_type: "message",
      payload: {
        page_id: event.pageId,
        sender_id: event.senderId,
        message_id: event.mid ?? null,
        text_length: event.text.length
      },
      processed: false
    });
    if (logged.duplicate) continue;

    try {
      if (event.mid) {
        const existing = await repository.getMessageByFacebookId(event.mid);
        if (existing) {
          await markSkipped(event.eventKey, "duplicate_message");
          continue;
        }
      }

      const conversation = await repository.getOrCreateConversation(event.senderId, "facebook", event.pageId);
      await repository.addMessage(conversation.id, "customer", event.text, {
        pageId: event.pageId,
        mid: event.mid,
        createdTime: event.timestamp ? new Date(event.timestamp).toISOString() : undefined
      });

      const page = await getFacebookPage(event.pageId);
      if (!page?.page_access_token) {
        await markSkipped(event.eventKey, "page_not_connected_or_missing_token");
        continue;
      }
      if (!page.connected || !page.automation_enabled || !page.auto_reply_messenger) {
        await markSkipped(event.eventKey, "bot_disabled_for_page");
        continue;
      }

      const aiProvider = String(page.ai_provider ?? "") === "meta" ? "meta" : "gemini";

      await upsertFacebookPage({
        ...page,
        last_webhook_at: new Date().toISOString(),
        webhook_status: "active"
      });

      const delayMs = Math.min(2000, Math.max(0, Number(page.ai_reply_delay_seconds ?? 1) * 1000));
      if (delayMs) await sleep(delayMs);

      const history = await repository.getMessages(conversation.id, { limit: 24 });
      const latestCustomer = [...history].reverse().find((message) => message.sender_type === "customer");
      if (event.mid && latestCustomer?.facebook_message_id && latestCustomer.facebook_message_id !== event.mid) {
        await markSkipped(event.eventKey, "superseded_by_newer_customer_message");
        continue;
      }

      const reply = await generatePageChatReply({
        page,
        history,
        customerMessage: event.text
      });

      const messengerResult = await sendMessengerText(event.senderId, reply, page.page_access_token);
      await repository.addMessage(conversation.id, "ai", reply, {
        pageId: event.pageId,
        messenger_result: messengerResult,
        provider: aiProvider,
        model: page.ai_model ?? null
      });

      await markWebhookEventProcessed(event.eventKey, {
        processed: true,
        processing_error: null,
        payload: {
          page_id: event.pageId,
          sender_id: event.senderId,
          message_id: event.mid ?? null,
          replied: true,
          provider: aiProvider
        }
      });
      replied += 1;
    } catch (error) {
      const message = safeError(error);
      console.error("[simple-messenger-webhook] failed", {
        page_id: event.pageId,
        sender_id: event.senderId,
        message_id: event.mid ?? null,
        error: message
      });
      await markWebhookEventProcessed(event.eventKey, {
        processed: false,
        processing_error: message,
        payload: {
          page_id: event.pageId,
          sender_id: event.senderId,
          message_id: event.mid ?? null,
          replied: false,
          error: message
        }
      });
    }
  }

  return NextResponse.json({ ok: true, received: events.length, replied });
}

async function markSkipped(eventKey: string, reason: string) {
  await markWebhookEventProcessed(eventKey, {
    processed: true,
    processing_error: null,
    payload: { replied: false, skipped: reason }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/key=[^&\s]+/gi, "key=REDACTED")
    .replace(/access_token=[^&\s]+/gi, "access_token=REDACTED")
    .slice(0, 1000);
}
