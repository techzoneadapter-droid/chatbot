import { createHmac, timingSafeEqual } from "node:crypto";
import type { MessengerWebhookBody } from "@/lib/facebook/types";

export type NormalizedFacebookEvent =
  | {
      eventKey: string;
      type: "message";
      pageId: string;
      senderId: string;
      recipientId?: string;
      text: string;
      mid?: string;
      timestamp?: number;
      isEcho: boolean;
      shouldTriggerAI: boolean;
      raw: Record<string, unknown>;
    }
  | {
      eventKey: string;
      type: "comment";
      pageId: string;
      senderId?: string;
      senderName?: string;
      postId: string;
      commentId: string;
      parentId?: string | null;
      text: string;
      verb?: string;
      createdTime?: string;
      raw: Record<string, unknown>;
    };

export function verifyWebhook(mode: string | null, token: string | null, challenge: string | null) {
  const expectedToken = process.env.FACEBOOK_VERIFY_TOKEN || "paint-chatbot-dev-token";
  if (mode === "subscribe" && token && token === expectedToken) return challenge;
  return null;
}

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
}

export function normalizeWebhookBody(body: MessengerWebhookBody): NormalizedFacebookEvent[] {
  const events: NormalizedFacebookEvent[] = [];
  for (const entry of body.entry ?? []) {
    const entryPageId = String(entry.id ?? "");
    for (const event of entry.messaging ?? []) {
      const text = event.message?.text?.trim();
      if (!entryPageId || !event.sender?.id) continue;
      if (event.delivery || event.read) continue;
      const isEcho = Boolean(event.message?.is_echo);
      const pageId = entryPageId;
      const senderId = isEcho ? event.recipient?.id ?? "" : event.sender.id;
      if (!pageId || !senderId || !text || isPageOrSystemActor(senderId, pageId)) continue;
      const mid = event.message?.mid;
      events.push({
        eventKey: mid ? `msg:${pageId}:${mid}` : `msg:${pageId}:${senderId}:${event.timestamp ?? entry.time ?? Date.now()}`,
        type: "message",
        pageId,
        senderId,
        recipientId: event.recipient?.id,
        text,
        mid,
        timestamp: event.timestamp ?? entry.time,
        isEcho,
        shouldTriggerAI: !isEcho && senderId !== pageId,
        raw: event as Record<string, unknown>
      });
    }

    for (const change of (entry as any).changes ?? []) {
      if (change.field !== "feed") continue;
      const value = change.value ?? {};
      if (value.item !== "comment" || !value.comment_id || !value.message) continue;
      if (value.verb && value.verb !== "add") continue;
      events.push({
        eventKey: `comment:${entryPageId}:${value.comment_id}:${value.verb ?? "add"}`,
        type: "comment",
        pageId: entryPageId,
        senderId: value.from?.id,
        senderName: value.from?.name,
        postId: value.post_id,
        commentId: value.comment_id,
        parentId: value.parent_id ?? null,
        text: String(value.message).trim(),
        verb: value.verb,
        createdTime: value.created_time,
        raw: value
      });
    }
  }
  return events;
}

export function extractMessengerTexts(body: MessengerWebhookBody) {
  return normalizeWebhookBody(body).filter((event) => event.type === "message");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isPageOrSystemActor(senderId: string, pageId: string) {
  return !senderId || senderId === pageId || senderId === "0";
}
