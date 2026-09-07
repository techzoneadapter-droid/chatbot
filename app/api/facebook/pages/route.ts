import { NextResponse } from "next/server";
import { getFacebookPage, getFacebookWebhookDiagnostics, listFacebookPages, saveWebhookEvent, upsertFacebookPage } from "@/lib/admin-data";
import { getProviderStatusAsync } from "@/lib/ai/config";
import { DEFAULT_COMMENT_HIDE_MODE, normalizeCommentHideMode } from "@/lib/facebook/comment-hide-mode";
import { COMMENT_AUTOMATION_PERMISSIONS, FacebookGraphApiError, appUrl, inspectPageToken, oauthRedirectUri, subscribePageToWebhook, unsubscribePageFromWebhook } from "@/lib/facebook/oauth";
import { createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { AIProviderName, FacebookPage, PageChatRules } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const pages = await listFacebookPages();
  const diagnostics = await getFacebookWebhookDiagnostics();
  return NextResponse.json({ pages, setup: await setupStatus(pages), diagnostics: await pageDiagnostics(pages, diagnostics), globalDiagnostic: globalWebhookDiagnostic(diagnostics, pages) });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.page_id || !body.page_name) return NextResponse.json({ error: "Missing Page ID or Page name" }, { status: 400 });
  try {
    const page = await upsertFacebookPage(
      {
        page_id: String(body.page_id).trim(),
        page_name: String(body.page_name).trim(),
        page_access_token: body.page_access_token ? String(body.page_access_token).trim() : undefined,
        connected: body.connected ?? undefined,
        automation_enabled: body.automation_enabled ?? true,
        auto_reply_messenger: body.auto_reply_messenger ?? true,
        ai_sales_mode: body.ai_sales_mode ?? true,
        auto_handoff: body.auto_handoff ?? true,
        auto_like_comments: body.auto_like_comments ?? true,
        auto_reply_comments: body.auto_reply_comments ?? true,
        auto_hide_comments: body.auto_hide_comments ?? true,
        comment_hide_mode: normalizeCommentHideMode(body.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE,
        hide_phone_comments: body.hide_phone_comments ?? true,
        hide_keyword_comments: body.hide_keyword_comments ?? true,
        ai_provider: body.ai_provider === "gemini" ? "gemini" : "openai",
        ai_model: typeof body.ai_model === "string" ? body.ai_model : null,
        ai_fallback_provider: body.ai_fallback_provider === "gemini" || body.ai_fallback_provider === "openai" ? body.ai_fallback_provider : null,
        ai_provider_fallback_enabled: Boolean(body.ai_provider_fallback_enabled),
        chat_rules: normalizeChatRules(body.chat_rules)
      },
      { throwOnSupabaseError: true }
    );
    return NextResponse.json({ page, pages: await listFacebookPages() });
  } catch {
    return NextResponse.json({ error: "Cannot save Facebook Page settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.page_id) return NextResponse.json({ error: "Missing Page ID" }, { status: 400 });
  const existing = await getFacebookPage(String(body.page_id));
  type BooleanPageSetting =
    | "automation_enabled"
    | "auto_reply_messenger"
    | "ai_sales_mode"
    | "auto_handoff"
    | "auto_like_comments"
    | "auto_reply_comments"
    | "auto_hide_comments"
    | "hide_phone_comments"
    | "hide_keyword_comments";
  type StringPageSetting =
    | "ai_business_name"
    | "ai_system_prompt"
    | "ai_tone"
    | "ai_sales_goal"
    | "ai_product_context"
    | "ai_faq_context"
    | "ai_allowed_topics"
    | "ai_fallback_message";
  const patch: Partial<Pick<FacebookPage, BooleanPageSetting | StringPageSetting | "comment_hide_mode" | "ai_reply_delay_seconds" | "blocked_keywords" | "ai_provider" | "ai_model" | "ai_fallback_provider" | "ai_provider_fallback_enabled" | "chat_rules">> = {};
  const allowed: BooleanPageSetting[] = [
    "automation_enabled",
    "auto_reply_messenger",
    "ai_sales_mode",
    "auto_handoff",
    "auto_like_comments",
    "auto_reply_comments",
    "auto_hide_comments",
    "hide_phone_comments",
    "hide_keyword_comments"
  ];
  for (const key of allowed) {
    if (typeof body[key] === "boolean") patch[key] = body[key];
  }
  const stringSettings: StringPageSetting[] = [
    "ai_business_name",
    "ai_system_prompt",
    "ai_tone",
    "ai_sales_goal",
    "ai_product_context",
    "ai_faq_context",
    "ai_allowed_topics",
    "ai_fallback_message"
  ];
  for (const key of stringSettings) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  if ([0, 3, 5, 10].includes(Number(body.ai_reply_delay_seconds))) patch.ai_reply_delay_seconds = Number(body.ai_reply_delay_seconds);
  if (body.ai_provider === "openai" || body.ai_provider === "gemini") patch.ai_provider = body.ai_provider;
  if (typeof body.ai_model === "string") patch.ai_model = body.ai_model;
  if (body.ai_fallback_provider === "openai" || body.ai_fallback_provider === "gemini") patch.ai_fallback_provider = body.ai_fallback_provider;
  if (typeof body.ai_provider_fallback_enabled === "boolean") patch.ai_provider_fallback_enabled = body.ai_provider_fallback_enabled;
  if (body.chat_rules && typeof body.chat_rules === "object") patch.chat_rules = normalizeChatRules(body.chat_rules);
  if (Array.isArray(body.blocked_keywords)) patch.blocked_keywords = body.blocked_keywords.map(String).map((item: string) => item.trim()).filter(Boolean);
  const commentHideMode = normalizeCommentHideMode(body.comment_hide_mode);
  if (commentHideMode) patch.comment_hide_mode = commentHideMode;
  try {
    const page = await upsertFacebookPage(
      {
        page_id: String(body.page_id),
        page_name: String(body.page_name ?? existing?.page_name ?? body.page_id),
        ...patch
      },
      { throwOnSupabaseError: true }
    );
    return NextResponse.json({ page, pages: await listFacebookPages() });
  } catch {
    return NextResponse.json({ error: "Cannot save Facebook Page settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  if (!body.page_id) return NextResponse.json({ error: "Missing Page ID" }, { status: 400 });
  const pageId = String(body.page_id);
  const action = body.action === "subscribe" ? "subscribe" : body.action === "wait_live" ? "wait_live" : "check";
  const page = await getRawFacebookPage(pageId);
  if (!page?.page_access_token) return NextResponse.json({ error: "Page has no token to inspect" }, { status: 400 });

  try {
    if (action === "wait_live") {
      await saveLiveWaitMarker(pageId);
      return NextResponse.json({ ok: true, waitingForLiveWebhook: true, pages: await listFacebookPages() });
    }
    let result = await inspectPageToken(pageId, page.page_access_token);
    let subscribeError: string | null = null;
    let subscribeResponse: unknown = null;
    let webhookStatus: "active" | "error" = result.subscribedFields.includes("messages") ? "active" : "error";
    if (action === "subscribe") {
      try {
        subscribeResponse = await subscribePageToWebhook(pageId, page.page_access_token);
        result = await inspectPageToken(pageId, page.page_access_token);
        webhookStatus = result.subscribedFields.includes("messages") ? "active" : "error";
      } catch (error) {
        subscribeError = graphErrorMessage(error);
        webhookStatus = "error";
      }
    }
    const endpointReachable = await webhookEndpointReachable();
    await upsertFacebookPage({
      page_id: pageId,
      page_name: result.profile?.name ?? page.page_name ?? pageId,
      page_avatar_url: page.page_avatar_url ?? result.profile?.picture?.data?.url ?? null,
      connected: result.ok,
      webhook_status: webhookStatus,
      last_connection_check_at: new Date().toISOString(),
      granted_permissions: result.granted.length ? result.granted : page.granted_permissions ?? [],
      missing_permissions: result.missing.length ? result.missing : page.missing_permissions ?? []
    });
    const missingPermissions = result.missing.length ? result.missing : page.missing_permissions ?? [];
    const missingCommentAutomation = missingPermissions.filter((permission) => COMMENT_AUTOMATION_PERMISSIONS.includes(permission as (typeof COMMENT_AUTOMATION_PERMISSIONS)[number]));
    return NextResponse.json({
      ok: result.ok && result.appSubscribed && result.subscribedFields.includes("messages") && endpointReachable,
      status: {
        facebookPage: result.ok ? "OK" : "Error",
        pageToken: result.ok ? "OK" : result.error ? `Error ${result.error.code ?? result.error.status}: ${result.error.message}` : "Error",
        messenger: missingPermissions.includes("pages_messaging") ? "Missing pages_messaging" : "Ready",
        webhookSubscription: result.appSubscribed && result.subscribedFields.includes("messages") ? "OK" : webhookSubscriptionError2(result.subscribedFields, result.appSubscribed),
        readComments: missingPermissions.includes("pages_read_engagement")
          ? "Missing pages_read_engagement"
          : missingPermissions.includes("pages_read_user_content")
            ? "Missing pages_read_user_content"
            : "Ready",
        replyComments: missingCommentAutomation.length ? `Missing ${missingCommentAutomation.join(", ")}` : "Ready",
        hideComments: missingCommentAutomation.length ? `Missing ${missingCommentAutomation.join(", ")}` : "Ready",
        missingPermissions
      },
      diagnostics: {
        tokenValid: result.ok,
        appSubscribed: result.appSubscribed,
        subscribed: result.subscribedFields.includes("messages"),
        subscribedFields: result.subscribedFields,
        endpointReachable,
        subscribeAttempted: action === "subscribe",
        subscribeError,
        subscribeResponse
      },
      pages: await listFacebookPages()
    });
  } catch {
    await upsertFacebookPage({
      page_id: pageId,
      page_name: page.page_name ?? pageId,
      connected: false,
      webhook_status: "error",
      last_connection_check_at: new Date().toISOString()
    });
    return NextResponse.json({ ok: false, error: "Cannot inspect Facebook Page connection" }, { status: 502 });
  }
}

async function pageDiagnostics(pages: Awaited<ReturnType<typeof listFacebookPages>>, events: Awaited<ReturnType<typeof getFacebookWebhookDiagnostics>>) {
  const endpointReachable = await webhookEndpointReachable();
  return Promise.all(pages.map(async (page) => {
    const rawPage = await getRawFacebookPage(page.page_id);
    const inspected = rawPage?.page_access_token ? await inspectPageToken(page.page_id, rawPage.page_access_token).catch(() => null) : null;
    const waiting = events.find((event) => event.page_id === page.page_id && event.event_type === "live_wait");
    const last = events.find((event) => event.page_id === page.page_id && event.event_type !== "live_wait" && !isSyntheticDiagnostic(event) && entryId(event) === page.page_id);
    const payload = (last?.payload && typeof last.payload === "object" ? last.payload : {}) as Record<string, unknown>;
    const normalized = payload.normalized && typeof payload.normalized === "object" ? (payload.normalized as Record<string, unknown>) : {};
    const sender = payload.sender && typeof payload.sender === "object" ? (payload.sender as Record<string, unknown>) : {};
    const message = payload.message && typeof payload.message === "object" ? (payload.message as Record<string, unknown>) : {};
    const waitTime = waiting?.created_at ? new Date(waiting.created_at).getTime() : 0;
    const liveTime = last?.created_at ? new Date(last.created_at).getTime() : 0;
    return {
      page_id: page.page_id,
      tokenValid: inspected?.ok ? "OK" : "FAIL",
      endpointReachable: endpointReachable ? "OK" : "FAIL",
      appSubscription: inspected?.appSubscribed ? "OK" : "FAIL",
      messagesSubscribed: inspected?.subscribedFields.includes("messages") ? "OK" : "FAIL",
      tokenPageIdMatch: inspected?.ok ? "OK" : "FAIL",
      subscribedFields: inspected?.subscribedFields ?? [],
      liveWebhookStatus: waiting && waitTime >= liveTime ? "waiting" : last ? "received" : "none",
      lastWebhookAt: last?.created_at ?? null,
      lastEventType: last?.event_type ?? null,
      lastSenderId: String(normalized.sender_id ?? sender.id ?? payload.sender_id ?? payload.SENDER_ID ?? ""),
      lastMessageId: String(normalized.message_id ?? message.mid ?? payload.message_id ?? payload.MESSAGE_ID ?? ""),
      lastMessagePreview: String(payload.message_text_preview ?? normalized.message_text_preview ?? message.text ?? ""),
      lastDbWrite: last ? (last.processed ? "Thanh cong" : last.processing_error ? "That bai" : "Chua xu ly") : "Chua co",
      lastDbError: last?.processing_error ?? null,
      lastTime: last?.created_at ?? null
    };
  }));
}

async function webhookEndpointReachable() {
  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || "paint-chatbot-dev-token";
  try {
    const url = `${appUrl()}/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=ok`;
    const response = await fetch(url, { cache: "no-store" });
    return response.ok && (await response.text()) === "ok";
  } catch {
    return false;
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("page_id");
  if (!id) return NextResponse.json({ error: "Missing Page ID" }, { status: 400 });
  const page = await getRawFacebookPage(id);
  if (!page) return NextResponse.json({ error: "Facebook Page not found" }, { status: 404 });
  let unsubscribeError: string | null = null;
  if (page.page_access_token) {
    try {
      await unsubscribePageFromWebhook(id, page.page_access_token);
    } catch (error) {
      unsubscribeError = graphErrorMessage(error);
    }
  }
  await upsertFacebookPage({
    page_id: id,
    page_name: page.page_name ?? id,
    connected: false,
    automation_enabled: false,
    auto_reply_messenger: false,
    auto_like_comments: false,
    auto_reply_comments: false,
    auto_hide_comments: false,
    webhook_status: unsubscribeError ? "error" : "unknown",
    page_access_token: ""
  });
  return NextResponse.json({ pages: await listFacebookPages(), unsubscribeError });
}

async function getRawFacebookPage(pageId: string) {
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const { data } = await supabase.from("facebook_pages").select("*").eq("page_id", pageId).maybeSingle();
    if (data) return data as FacebookPage;
  }
  return getFacebookPage(pageId);
}

function graphErrorMessage(error: unknown) {
  if (error instanceof FacebookGraphApiError) {
    return `HTTP ${error.status}${error.code ? ` code ${error.code}` : ""}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unknown Graph API error";
}

function webhookSubscriptionError2(fields: string[], appSubscribed = true) {
  if (!appSubscribed) return "App chua dang ky vao Page subscribed_apps";
  if (!fields.includes("messages")) return "Page chua dang ky webhook messages";
  return `Thieu webhook field: ${["feed"].filter((field) => !fields.includes(field)).join(", ")}`;
}

async function saveLiveWaitMarker(pageId: string) {
  await saveWebhookEvent({
    event_key: `live_wait:${pageId}:${Date.now()}`,
    page_id: pageId,
    event_type: "live_wait",
    payload: { page_id: pageId, live_waiting: true, received_at: new Date().toISOString() },
    processed: true
  });
}

function globalWebhookDiagnostic(events: Awaited<ReturnType<typeof getFacebookWebhookDiagnostics>>, pages: Awaited<ReturnType<typeof listFacebookPages>>) {
  const latest = events.find((event) => event.event_type !== "live_wait") ?? null;
  if (!latest) return null;
  const payload = (latest.payload && typeof latest.payload === "object" ? latest.payload : {}) as Record<string, unknown>;
  const normalized = payload.normalized && typeof payload.normalized === "object" ? (payload.normalized as Record<string, unknown>) : {};
  const mappedPage = latest.page_id ? pages.find((page) => page.page_id === latest.page_id) : null;
  return {
    received_at: payload.received_at ?? latest.created_at,
    entry_id: payload.entry_id ?? latest.page_id ?? "unknown_page_id",
    sender_id: payload.messaging_sender_id ?? normalized.sender_id ?? null,
    recipient_id: payload.messaging_recipient_id ?? normalized.recipient_id ?? null,
    message_mid: payload.message_mid ?? normalized.message_id ?? rawMessageField(payload, "mid"),
    message_text_preview: payload.message_text_preview ?? rawMessageField(payload, "text"),
    mapped_page: mappedPage?.page_name ?? (latest.page_id ? "unknown_page_id" : null),
    db_write: latest.processed ? "OK" : latest.processing_error ? "FAIL" : "PENDING",
    error: latest.processing_error ?? null,
    synthetic: isSyntheticDiagnostic(latest)
  };
}

function entryId(event: Awaited<ReturnType<typeof getFacebookWebhookDiagnostics>>[number]) {
  const payload = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, unknown>;
  return typeof payload.entry_id === "string" ? payload.entry_id : event.page_id ?? null;
}

function isSyntheticDiagnostic(event: Awaited<ReturnType<typeof getFacebookWebhookDiagnostics>>[number]) {
  const payload = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, unknown>;
  const normalized = payload.normalized && typeof payload.normalized === "object" ? (payload.normalized as Record<string, unknown>) : {};
  const rawSender = rawObjectField(payload, "sender", "id");
  const rawMid = rawMessageField(payload, "mid");
  const rawText = rawMessageField(payload, "text");
  return (
    Boolean(payload.synthetic) ||
    String(payload.messaging_sender_id ?? normalized.sender_id ?? rawSender ?? "").startsWith("codex_") ||
    String(payload.message_mid ?? normalized.message_id ?? rawMid ?? "").startsWith("codex_") ||
    String(payload.message_text_preview ?? rawText ?? "").toLowerCase().includes("diagnostic") ||
    JSON.stringify(payload).toLowerCase().includes("codex_") ||
    JSON.stringify(payload).toLowerCase().includes("diagnostic")
  );
}

function rawMessageField(payload: Record<string, unknown>, key: string) {
  return rawObjectField(payload, "message", key);
}

function rawObjectField(payload: Record<string, unknown>, objectKey: string, key: string) {
  const value = payload[objectKey];
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function webhookSubscriptionError(fields: string[]) {
  if (!fields.includes("messages")) return "Page chưa đăng ký webhook messages";
  return `Thiếu webhook field: ${["feed"].filter((field) => !fields.includes(field)).join(", ")}`;
}

async function setupStatus(pages: Awaited<ReturnType<typeof listFacebookPages>>) {
  const providerStatus = await getProviderStatusAsync();
  const hasAppId = Boolean(process.env.FACEBOOK_APP_ID);
  const hasAppSecret = Boolean(process.env.FACEBOOK_APP_SECRET);
  const hasVerifyToken = Boolean(process.env.FACEBOOK_VERIFY_TOKEN);
  const hasGraphVersion = Boolean(process.env.FACEBOOK_GRAPH_API_VERSION || process.env.FACEBOOK_GRAPH_VERSION);
  const hasAppUrl = Boolean(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);
  const hasPage = pages.some((page) => page.connected);
  return {
    appId: hasAppId ? "Configured" : "Not configured",
    appSecret: hasAppSecret ? "Configured" : "Not configured",
    verifyToken: hasVerifyToken ? "Configured" : "Not configured",
    graphApiVersion: hasGraphVersion ? "Configured" : "Default v26.0",
    appUrl: hasAppUrl ? "Configured" : "Not configured",
    supabase: isSupabaseConfigured() ? "Configured" : "Not configured",
    facebookLogin: hasAppId && hasAppSecret && hasAppUrl ? "Configured" : "Not configured",
    facebookPage: hasPage ? "Configured" : "Not configured",
    webhook: hasVerifyToken && hasAppUrl ? "Configured" : "Not configured",
    messenger: pages.some((page) => page.connected && page.auto_reply_messenger) ? "Configured" : "Not configured",
    commentAutomation: pages.some((page) => page.connected && (page.auto_reply_comments || page.auto_like_comments || page.auto_hide_comments)) ? "Configured" : "Not configured",
    openai: providerStatus.openai ? "Configured" : "Not configured",
    gemini: providerStatus.gemini ? "Configured" : "Not configured",
    redirectUri: oauthRedirectUri()
  };
}

function normalizeChatRules(raw: unknown): PageChatRules {
  const value = (raw && typeof raw === "object" ? raw : {}) as PageChatRules;
  return {
    ai_auto_reply: value.ai_auto_reply ?? true,
    human_takeover_default: value.human_takeover_default ?? false,
    max_response_length: Number(value.max_response_length || 900),
    allow_emoji: value.allow_emoji ?? true,
    ask_phone: value.ask_phone ?? true,
    ask_address: value.ask_address ?? true,
    auto_close_order: value.auto_close_order ?? false,
    auto_send_price: value.auto_send_price ?? false,
    after_hours_reply: value.after_hours_reply ?? true,
    business_hours: value.business_hours || "08:00-21:00",
    after_hours_fallback: value.after_hours_fallback || "Dạ hiện đã ngoài giờ làm việc, nhân viên sẽ phản hồi lại mình sớm nhất ạ.",
    max_ai_followups: Number(value.max_ai_followups || 4),
    stop_on_not_interested: value.stop_on_not_interested ?? true,
    stop_on_human_request: value.stop_on_human_request ?? true
  };
}
