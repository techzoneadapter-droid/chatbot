import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { runSalesEngine } from "@/lib/ai/sales-engine";
import { getAutomationSettings, getFacebookPage, markWebhookEventProcessed, saveWebhookEvent, upsertComment, updateComment, upsertFacebookPage } from "@/lib/admin-data";
import { classifyComment } from "@/lib/facebook/comment-automation";
import { clientForPage } from "@/lib/facebook/graph-api";
import { sendMessengerText } from "@/lib/facebook/messenger";
import { FacebookGraphApiError } from "@/lib/facebook/oauth";
import { normalizeWebhookBody, verifyMetaSignature, verifyWebhook } from "@/lib/facebook/webhook";
import { listProducts } from "@/lib/products/product-service";
import { createChatRepository } from "@/lib/storage/chat-repository";
import type { Conversation, FacebookPage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challenge = verifyWebhook(searchParams.get("hub.mode"), searchParams.get("hub.verify_token"), searchParams.get("hub.challenge"));
  if (!challenge) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const receivedAt = new Date().toISOString();
  const method = request.method;
  const rawBody = await request.text();
  const parsedBody = parseJsonObject(rawBody);
  const earlyDiagnostic = buildEarlyDiagnostic({ receivedAt, method, rawBody, body: parsedBody.body });
  await saveWebhookEvent({
    event_key: earlyDiagnostic.event_key,
    page_id: earlyDiagnostic.page_id,
    event_type: earlyDiagnostic.event_type,
    payload: earlyDiagnostic.payload,
    processed: false
  });
  console.info("[FB_WEBHOOK_RECEIVED]", scrubPayload({
    received_at: receivedAt,
    method,
    object: parsedBody.body && typeof parsedBody.body.object === "string" ? parsedBody.body.object : null,
    entry_count: Array.isArray(parsedBody.body?.entry) ? parsedBody.body.entry.length : 0,
    event_type: earlyDiagnostic.event_type
  }));

  try {
    if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      await markWebhookEventProcessed(earlyDiagnostic.event_key, {
        processed: false,
        processing_error: "invalid_signature",
        payload: { ...earlyDiagnostic.payload, http_processing_result: "invalid_signature" }
      });
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 403 });
    }
    if (!parsedBody.ok || !parsedBody.body) {
      await markWebhookEventProcessed(earlyDiagnostic.event_key, {
        processed: false,
        processing_error: parsedBody.error,
        payload: { ...earlyDiagnostic.payload, http_processing_result: "invalid_json", error: parsedBody.error }
      });
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 200 });
    }
    const body = parsedBody.body;
    const events = normalizeWebhookBody(body);
    if (events.length === 0) {
      await markWebhookEventProcessed(earlyDiagnostic.event_key, {
        processed: true,
        processing_error: null,
        payload: { ...earlyDiagnostic.payload, http_processing_result: "received_no_conversation_event", normalized_event_count: 0 }
      });
      return NextResponse.json({ ok: true, received: 0, processed: 0 });
    }
    const repository = createChatRepository();
    const settings = await getAutomationSettings();
    let processed = 0;

    for (const event of events) {
      const webhookLog = {
        timestamp: new Date().toISOString(),
        object: typeof body.object === "string" ? body.object : null,
        page_id: event.pageId,
        sender_psid: event.type === "message" ? event.senderId : event.senderId ?? null,
        recipient_id: event.type === "message" ? event.recipientId ?? null : null,
        message_id: event.type === "message" ? event.mid ?? null : event.commentId,
        text_length: event.text.length,
        event_type: event.type,
        duplicate: false
      };
      logWebhook("WEBHOOK_RECEIVED", {
        PAGE_ID: event.pageId,
        EVENT_TYPE: event.type,
        SENDER_ID: event.type === "message" ? event.senderId : event.senderId ?? null,
        RECIPIENT_ID: event.type === "message" ? event.recipientId ?? null : null,
        MESSAGE_ID: event.type === "message" ? event.mid ?? null : event.commentId,
        IS_ECHO: event.type === "message" ? event.isEcho : false
      });
      const logged = await saveWebhookEvent({
        event_key: event.eventKey,
        page_id: event.pageId,
        event_type: event.type,
        payload: {
          ...scrubPayload(event.raw),
          normalized: normalizedLogPayload(event),
          db_write_success: false,
          db_write_status: "pending"
        },
        processed: false
      });
      console.info("[facebook-webhook] received", { ...webhookLog, duplicate: logged.duplicate });
      if (logged.duplicate) continue;
      const page = await getFacebookPage(event.pageId);
      logWebhook("PAGE_LOOKUP", {
        PAGE_ID: event.pageId,
        PAGE_FOUND: Boolean(page)
      });
      if (!page) {
        logWebhook("PAGE_NOT_FOUND", {
          PAGE_ID: event.pageId,
          EVENT_TYPE: event.type,
          SENDER_ID: event.type === "message" ? event.senderId : event.senderId ?? null,
          MESSAGE_ID: event.type === "message" ? event.mid ?? null : event.commentId
        });
        await markWebhookEventProcessed(earlyDiagnostic.event_key, {
          processed: false,
          processing_error: "unknown_page_id",
          payload: { ...earlyDiagnostic.payload, mapped_page: false, error: "unknown_page_id", http_processing_result: "unknown_page_id" }
        });
      }
      if (page) await upsertFacebookPage({ ...page, last_webhook_at: new Date().toISOString(), webhook_status: "active" });

      if (event.type === "message") {
        const senderType = event.shouldTriggerAI ? "customer" : "staff";
        let conversation;
        try {
          conversation = await repository.getOrCreateConversation(event.senderId, "facebook", event.pageId);
          logWebhook("CONVERSATION_UPSERTED", {
            PAGE_ID: event.pageId,
            SENDER_ID: event.senderId,
            RECIPIENT_ID: event.recipientId ?? null,
            CUSTOMER_ID: conversation.customer_id ?? null,
            CONVERSATION_ID: conversation.id,
            EVENT_TYPE: event.type,
            IS_ECHO: event.isEcho
          });
          if (event.shouldTriggerAI && page?.page_access_token) {
            void hydrateCustomerProfile(repository, conversation.id, event.senderId, event.pageId, page.page_access_token);
          }
          console.info("[facebook-webhook] conversation upserted", {
            page_id: event.pageId,
            sender_psid: event.senderId,
            conversation_id: conversation.id,
            message_id: event.mid ?? null,
            success: true
          });
        } catch (error) {
          logWebhook("DB_ERROR", {
            PAGE_ID: event.pageId,
            EVENT_TYPE: event.type,
            SENDER_ID: event.senderId,
            MESSAGE_ID: event.mid ?? null,
            error: safeErrorMessage(error)
          });
          await markWebhookEventProcessed(event.eventKey, {
            processed: false,
            processing_error: safeErrorMessage(error),
            payload: {
              ...scrubPayload(event.raw),
              normalized: normalizedLogPayload(event),
              db_write_success: false,
              db_write_status: "failed",
              db_write_at: new Date().toISOString(),
              db_write_error: safeErrorMessage(error)
            }
          });
          console.error("[facebook-webhook] conversation upsert failed", {
            page_id: event.pageId,
            sender_psid: event.senderId,
            message_id: event.mid ?? null,
            success: false,
            error: safeErrorMessage(error)
          });
          continue;
        }
        try {
          await repository.addMessage(conversation.id, senderType, event.text, {
            pageId: event.pageId,
            mid: event.mid,
            createdTime: event.timestamp ? new Date(event.timestamp).toISOString() : undefined,
            is_echo: event.isEcho
          });
          logWebhook("MESSAGE_INSERTED", {
            PAGE_ID: event.pageId,
            EVENT_TYPE: event.type,
            SENDER_ID: event.senderId,
            RECIPIENT_ID: event.recipientId ?? null,
            MESSAGE_ID: event.mid ?? null,
            IS_ECHO: event.isEcho,
            PAGE_FOUND: Boolean(page),
            CUSTOMER_ID: conversation.customer_id ?? null,
            CONVERSATION_ID: conversation.id,
            MESSAGE_INSERTED: true
          });
          await markWebhookEventProcessed(event.eventKey, {
            processed: true,
            processing_error: null,
            payload: {
              ...scrubPayload(event.raw),
              normalized: normalizedLogPayload(event),
              db_write_success: true,
              db_write_status: "success",
              db_write_at: new Date().toISOString(),
              conversation_id: conversation.id,
              sender_type: senderType
            }
          });
          console.info("[facebook-webhook] message inserted", {
            page_id: event.pageId,
            sender_psid: event.senderId,
            conversation_id: conversation.id,
            message_id: event.mid ?? null,
            sender_type: senderType,
            success: true
          });
        } catch (error) {
          logWebhook("DB_ERROR", {
            PAGE_ID: event.pageId,
            EVENT_TYPE: event.type,
            SENDER_ID: event.senderId,
            MESSAGE_ID: event.mid ?? null,
            error: safeErrorMessage(error)
          });
          await markWebhookEventProcessed(event.eventKey, {
            processed: false,
            processing_error: safeErrorMessage(error),
            payload: {
              ...scrubPayload(event.raw),
              normalized: normalizedLogPayload(event),
              db_write_success: false,
              db_write_status: "failed",
              db_write_at: new Date().toISOString(),
              db_write_error: safeErrorMessage(error)
            }
          });
          console.error("[facebook-webhook] message insert failed", {
            page_id: event.pageId,
            sender_psid: event.senderId,
            conversation_id: conversation.id,
            message_id: event.mid ?? null,
            success: false,
            error: safeErrorMessage(error)
          });
          continue;
        }
        processed += 1;
        if (!event.shouldTriggerAI) continue;
        const pageAllows =
          (page?.automation_enabled ?? true) &&
          (page?.auto_reply_messenger ?? settings.messenger.autoReply) &&
          (page?.ai_sales_mode ?? settings.messenger.aiSalesMode);
        if (!conversation.ai_enabled || conversation.human_takeover || !pageAllows || !page?.page_access_token) continue;
        queueAIReply({
          conversationId: conversation.id,
          eventText: event.text,
          eventMid: event.mid,
          pageId: event.pageId,
          senderId: event.senderId,
          conversation,
          page,
          autoHandoff: page?.auto_handoff ?? settings.messenger.autoHandoff
        });
      } else {
        const isFromPage = event.senderId === event.pageId;
        const pageRow = page as FacebookPage | null;
        const classification = classifyComment({ page: pageRow, message: event.text, isFromPage, settings });
        await upsertComment({
          page_id: event.pageId,
          post_id: event.postId,
          comment_id: event.commentId,
          parent_id: event.parentId,
          external_user_id: event.senderId,
          customer_id: null,
          message: event.text,
          created_time: event.createdTime,
          is_from_page: isFromPage,
          hidden: false,
          liked: false,
          replied: false,
          classification: { ...classification },
          automation_result: {}
        });
        const client = clientForPage(page);
        const automation: Record<string, unknown> = {};
        const canManageEngagement = Boolean(page?.granted_permissions?.includes("pages_manage_engagement"));
        if (classification.shouldHide) {
          if (!client) {
            automation.hidden = false;
            automation.hide_error = "missing_page_token";
          } else if (!canManageEngagement) {
            automation.hidden = false;
            automation.hide_error = "missing_pages_manage_engagement";
          } else {
            const result = await runCommentGraphAction(event.pageId, event.commentId, "hide", () => client.hideComment(event.commentId));
            automation.hidden = result.ok;
            if (result.ok) await updateComment(event.commentId, { hidden: true });
            else automation.hide_error = result.error;
          }
        }
        if (classification.shouldReply && classification.reply) {
          if (!client) {
            automation.replied = false;
            automation.reply_error = "missing_page_token";
          } else if (!canManageEngagement) {
            automation.replied = false;
            automation.reply_error = "missing_pages_manage_engagement";
          } else {
            const result = await runCommentGraphAction(event.pageId, event.commentId, "reply", () => client.replyComment(event.commentId, classification.reply!));
            automation.replied = result.ok;
            if (result.ok) await updateComment(event.commentId, { replied: true });
            else automation.reply_error = result.error;
          }
        }
        if (classification.shouldLike) {
          if (!client) {
            automation.liked = false;
            automation.like_error = "missing_page_token";
          } else if (!canManageEngagement) {
            automation.liked = false;
            automation.like_error = "missing_pages_manage_engagement";
          } else {
            const result = await runCommentGraphAction(event.pageId, event.commentId, "like", () => client.likeComment(event.commentId));
            automation.liked = result.ok;
            if (result.ok) await updateComment(event.commentId, { liked: true });
            else automation.like_error = result.error;
          }
        }
        await updateComment(event.commentId, { automation_result: automation });
        await markWebhookEventProcessed(event.eventKey, {
          processed: true,
          processing_error: null,
          payload: {
            ...scrubPayload(event.raw),
            normalized: normalizedLogPayload(event),
            db_write_success: true,
            db_write_status: "success",
            db_write_at: new Date().toISOString(),
            automation
          }
        });
        processed += 1;
      }
    }

    await markWebhookEventProcessed(earlyDiagnostic.event_key, {
      processed: true,
      processing_error: null,
      payload: { ...earlyDiagnostic.payload, http_processing_result: "processed", normalized_event_count: events.length, processed }
    });
    return NextResponse.json({ ok: true, received: events.length, processed });
  } catch (error) {
    await markWebhookEventProcessed(earlyDiagnostic.event_key, {
      processed: false,
      processing_error: safeErrorMessage(error),
      payload: { ...earlyDiagnostic.payload, http_processing_result: "error", error: safeErrorMessage(error) }
    });
    console.error("Facebook webhook failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

async function hydrateCustomerProfile(repository: ReturnType<typeof createChatRepository>, conversationId: string, psid: string, pageId: string, pageAccessToken: string) {
  try {
    const profile = await clientForPage({ page_access_token: pageAccessToken })?.getMessengerProfile(psid);
    const name = profile?.name ?? ([profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null);
    await repository.updateConversation(conversationId, {
      customer_name: name,
      customer_avatar_url: profile?.profile_pic ?? null,
      customer_psid: psid,
      page_id: pageId
    });
    await repository.updateCustomerProfile(conversationId, { name, avatar: profile?.profile_pic ?? null, pageId, psid });
  } catch (error) {
    logWebhook("PROFILE_LOOKUP_ERROR", { PAGE_ID: pageId, SENDER_ID: psid, error: safeErrorMessage(error) });
  }
}

function queueAIReply(input: { conversationId: string; eventText: string; eventMid?: string; pageId: string; senderId: string; conversation: Conversation; page: FacebookPage; autoHandoff: boolean }) {
  setTimeout(() => {
    void processAIReply(input).catch((error) => {
      console.error("[facebook-webhook] async AI failed", {
        page_id: input.pageId,
        sender_psid: input.senderId,
        message_id: input.eventMid ?? null,
        error: safeErrorMessage(error)
      });
    });
  }, 0);
}

async function processAIReply(input: { conversationId: string; eventText: string; eventMid?: string; pageId: string; senderId: string; conversation: Conversation; page: FacebookPage; autoHandoff: boolean }) {
  const repository = createChatRepository();
  const products = await listProducts();
  const delayMs = Math.max(0, Number(input.page.ai_reply_delay_seconds ?? 3)) * 1000;
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  const latestHistory = await repository.getMessages(input.conversationId, { limit: 50 });
  const latestCustomer = [...latestHistory].reverse().find((message) => message.sender_type === "customer");
  if (input.eventMid && latestCustomer?.facebook_message_id && latestCustomer.facebook_message_id !== input.eventMid) return;
  const customerMessage = combineRecentCustomerMessages(latestHistory, input.eventText, delayMs);
  const state = await repository.getState(input.conversationId);

  const output = await runSalesEngine({
    conversation: { ...input.conversation, page_id: input.pageId },
    history: latestHistory,
    state,
    products,
    customerMessage,
    pageContext: input.page
  });
  if (output.confidence_status === "human_required") await repository.updateConversation(input.conversationId, { status: "HUMAN" });
  await repository.updateState(input.conversationId, output);
  await repository.upsertLeadFromState(input.conversationId, output);
  if (output.should_handoff && input.autoHandoff) await repository.setAiEnabled(input.conversationId, false);
  try {
    const messengerResult = await sendMessengerText(input.senderId, output.reply, input.page.page_access_token);
    await repository.addMessage(input.conversationId, "ai", output.reply, { pageId: input.pageId, sales_output: output, messenger_result: messengerResult });
  } catch (error) {
    await repository.addMessage(input.conversationId, "ai", output.reply, { pageId: input.pageId, sales_output: output, status: "failed", send_error: safeErrorMessage(error) });
    throw error;
  }
}

function combineRecentCustomerMessages(messages: Array<{ sender_type: string; message: string; created_at: string }>, fallback: string, delayMs: number) {
  const windowMs = Math.max(delayMs + 2000, 5000);
  const newest = [...messages].reverse().find((message) => message.sender_type === "customer");
  const newestTime = newest ? new Date(newest.created_at).getTime() : Date.now();
  const recent = messages.filter((message) => message.sender_type === "customer" && newestTime - new Date(message.created_at).getTime() <= windowMs);
  return recent.length ? recent.map((message) => message.message).join("\n") : fallback;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/access_token=[^&\s]+/g, "access_token=REDACTED") : "unknown";
}

function parseJsonObject(rawBody: string): { ok: true; body: Record<string, unknown> } | { ok: false; body: null; error: string } {
  try {
    const body = JSON.parse(rawBody) as unknown;
    return body && typeof body === "object" ? { ok: true, body: body as Record<string, unknown> } : { ok: false, body: null, error: "Body is not a JSON object" };
  } catch (error) {
    return { ok: false, body: null, error: safeErrorMessage(error) };
  }
}

function buildEarlyDiagnostic(input: { receivedAt: string; method: string; rawBody: string; body: Record<string, unknown> | null }) {
  const pageId = detectPageId(input.body);
  const event = detectWebhookEvent(input.body);
  const hash = createHash("sha256").update(input.rawBody).digest("hex").slice(0, 16);
  return {
    event_key: `raw:${input.receivedAt}:${hash}`,
    page_id: pageId,
    event_type: event.event_type,
    payload: scrubPayload({
      received_at: input.receivedAt,
      method: input.method,
      object: typeof input.body?.object === "string" ? input.body.object : null,
      entry_id: pageId,
      entry_time: event.entry_time,
      messaging_sender_id: event.sender_id,
      messaging_recipient_id: event.recipient_id,
      message_mid: event.message_id,
      message_text_preview: event.message_text_preview,
      message_is_echo: event.is_echo,
      postback: event.postback,
      raw_body_preview: input.rawBody.slice(0, 4000),
      payload: input.body,
      entry_count: Array.isArray(input.body?.entry) ? input.body.entry.length : 0,
      event_type_detected: event.event_type,
      page_id: pageId,
      sender_id: event.sender_id,
      recipient_id: event.recipient_id,
      message_id: event.message_id,
      message_exists: event.message_exists,
      is_echo: event.is_echo,
      postback_exists: event.postback_exists,
      synthetic: isSyntheticWebhookEvent(event.sender_id, event.message_id, event.message_text_preview),
      http_processing_result: "received"
    })
  };
}

function detectPageId(body: Record<string, unknown> | null) {
  const entry = firstEntry(body);
  return stringOrNull(entry?.id);
}

function detectWebhookEvent(body: Record<string, unknown> | null) {
  const entry = firstEntry(body);
  const messaging = firstMessaging(entry);
  const sender = messaging?.sender && typeof messaging.sender === "object" ? (messaging.sender as Record<string, unknown>) : null;
  const recipient = messaging?.recipient && typeof messaging.recipient === "object" ? (messaging.recipient as Record<string, unknown>) : null;
  const message = messaging?.message && typeof messaging.message === "object" ? (messaging.message as Record<string, unknown>) : null;
  const postback = messaging?.postback && typeof messaging.postback === "object" ? (messaging.postback as Record<string, unknown>) : null;
  const changes = Array.isArray(entry?.changes) ? (entry?.changes as unknown[]) : [];
  const firstChange = changes.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const changeValue = firstChange?.value && typeof firstChange.value === "object" ? (firstChange.value as Record<string, unknown>) : null;
  const eventType = message ? "message" : postback ? "postback" : firstChange?.field === "feed" ? "feed" : "unknown";
  return {
    event_type: eventType,
    entry_time: stringOrNull(entry?.time) ?? (typeof entry?.time === "number" ? String(entry.time) : null),
    sender_id: stringOrNull(sender?.id) ?? stringOrNull(changeValue?.from && typeof changeValue.from === "object" ? (changeValue.from as Record<string, unknown>).id : null),
    recipient_id: stringOrNull(recipient?.id),
    message_id: stringOrNull(message?.mid) ?? stringOrNull(changeValue?.comment_id),
    message_text_preview: typeof message?.text === "string" ? message.text.slice(0, 500) : null,
    message_exists: Boolean(message),
    is_echo: Boolean(message?.is_echo),
    postback_exists: Boolean(postback),
    postback: postback ? scrubPayload(postback) : null
  };
}

function firstEntry(body: Record<string, unknown> | null) {
  const entries = Array.isArray(body?.entry) ? body?.entry : [];
  const entry = entries.find((item) => item && typeof item === "object");
  return entry ? (entry as Record<string, unknown>) : null;
}

function firstMessaging(entry: Record<string, unknown> | null) {
  const messaging = Array.isArray(entry?.messaging) ? entry?.messaging : [];
  const event = messaging.find((item) => item && typeof item === "object");
  return event ? (event as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function isSyntheticWebhookEvent(senderId: unknown, messageId: unknown, text: unknown) {
  return String(senderId ?? "").startsWith("codex_") || String(messageId ?? "").startsWith("codex_") || String(text ?? "").toLowerCase().includes("diagnostic");
}

function logWebhook(event: string, payload: Record<string, unknown>) {
  console.info(`[facebook-webhook] ${event}`, JSON.parse(JSON.stringify(payload, (key, value) => (key.toLowerCase().includes("token") ? "[masked]" : value))));
}

function scrubPayload(payload: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(payload, (key, value) => (key.toLowerCase().includes("token") ? "[masked]" : value)));
}

function normalizedLogPayload(event: ReturnType<typeof normalizeWebhookBody>[number]) {
  return {
    page_id: event.pageId,
    sender_id: event.type === "message" ? event.senderId : event.senderId ?? null,
    recipient_id: event.type === "message" ? event.recipientId ?? null : null,
    message_id: event.type === "message" ? event.mid ?? null : event.commentId,
    message_exists: Boolean(event.text),
    is_echo: event.type === "message" ? event.isEcho : false,
    postback_exists: false,
    event_type: event.type
  };
}

async function runCommentGraphAction(pageId: string, commentId: string, action: "hide" | "reply" | "like", fn: () => Promise<unknown>) {
  try {
    await fn();
    return { ok: true as const };
  } catch (error) {
    const details =
      error instanceof FacebookGraphApiError
        ? {
            pageId,
            commentId,
            action,
            status: error.status,
            code: error.code ?? null,
            error_subcode: error.error_subcode ?? null,
            message: error.message
          }
        : { pageId, commentId, action, message: error instanceof Error ? error.message : "unknown" };
    console.error("[facebook-comment] graph action failed", details);
    return { ok: false as const, error: details };
  }
}
