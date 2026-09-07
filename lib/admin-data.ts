import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_COMMENT_HIDE_MODE, normalizeCommentHideMode } from "@/lib/facebook/comment-hide-mode";
import {
  createOrder as createLocalOrder,
  deleteFacebookPage as deleteLocalFacebookPage,
  getAutomationSettings as getLocalAutomationSettings,
  getFacebookPage as getLocalFacebookPage,
  listActivityLogs as listLocalActivityLogs,
  listComments as listLocalComments,
  listFacebookPages as listLocalFacebookPages,
  listOrders as listLocalOrders,
  logActivity,
  saveAutomationSettings as saveLocalAutomationSettings,
  saveWebhookEvent as saveLocalWebhookEvent,
  sanitizeFacebookPage,
  updateComment as updateLocalComment,
  upsertComment as upsertLocalComment,
  upsertFacebookPage as upsertLocalFacebookPage
} from "@/lib/storage/local-store";
import type { AutomationSettings, FacebookComment, FacebookPage, Order, OrderItem, WebhookEventLog } from "@/lib/types";
import { nowIso } from "@/lib/utils/time";

export async function listFacebookPages() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return listLocalFacebookPages();
  const { data, error } = await supabase.from("facebook_pages").select("*").order("updated_at", { ascending: false });
  if (error) return listLocalFacebookPages();
  return (data ?? []).map((page) => sanitizeFacebookPage(normalizeFacebookPage(page as FacebookPage)));
}

export async function getFacebookPage(pageId: string) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return getLocalFacebookPage(pageId);
  const { data, error } = await supabase.from("facebook_pages").select("*").eq("page_id", pageId).maybeSingle();
  if (error || !data) return getLocalFacebookPage(pageId);
  return normalizeFacebookPage(data as FacebookPage);
}

export async function upsertFacebookPage(input: Partial<FacebookPage> & { page_id: string; page_name: string }, options: { throwOnSupabaseError?: boolean } = {}) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return upsertLocalFacebookPage(input);
  const existing = await getFacebookPage(input.page_id);
  const token = input.page_access_token ?? existing?.page_access_token ?? null;
  const payload = {
    ...input,
    page_access_token: token,
    token_mask: token ? maskToken(token) : null,
    connected: input.connected ?? Boolean(token),
    webhook_status: input.webhook_status ?? existing?.webhook_status ?? "unknown",
    last_webhook_at: input.last_webhook_at ?? existing?.last_webhook_at ?? null,
    last_connection_check_at: input.last_connection_check_at ?? existing?.last_connection_check_at ?? null,
    granted_permissions: input.granted_permissions ?? existing?.granted_permissions ?? [],
    missing_permissions: input.missing_permissions ?? existing?.missing_permissions ?? [],
    comment_hide_mode: normalizeCommentHideMode(input.comment_hide_mode) ?? normalizeCommentHideMode(existing?.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE,
    updated_at: nowIso()
  };
  let { data, error } = await supabase.from("facebook_pages").upsert(payload, { onConflict: "page_id" }).select("*").single();
  if (error && isMissingCommentHideModeColumn(error)) {
    logSupabaseError("facebook_pages", "upsert", error);
    const { comment_hide_mode: _commentHideMode, ...payloadWithoutCommentHideMode } = payload;
    const retry = await supabase.from("facebook_pages").upsert(payloadWithoutCommentHideMode, { onConflict: "page_id" }).select("*").single();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    logSupabaseError("facebook_pages", "upsert", error);
    if (options.throwOnSupabaseError) throw new Error(`Supabase facebook_pages upsert failed: ${error.message}`);
    return upsertLocalFacebookPage(input);
  }
  await appendActivity("facebook.page.saved", `Đã lưu Facebook Page ${input.page_name}`, { page_id: input.page_id });
  return sanitizeFacebookPage(normalizeFacebookPage(data as FacebookPage));
}

function isMissingCommentHideModeColumn(error: { message?: string; code?: string }) {
  return error.code === "PGRST204" && Boolean(error.message?.includes("comment_hide_mode"));
}

function logSupabaseError(table: string, operation: string, error: { message?: string; code?: string; details?: string | null; hint?: string | null }) {
  console.error("[supabase]", {
    table,
    operation,
    code: error.code ?? null,
    message: error.message ?? "unknown",
    details: error.details ?? null,
    hint: error.hint ?? null
  });
}

function normalizeFacebookPage(page: FacebookPage): FacebookPage {
  return {
    ...page,
    comment_hide_mode: normalizeCommentHideMode(page.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE
  };
}

export async function deleteFacebookPage(pageId: string) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return deleteLocalFacebookPage(pageId);
  await supabase.from("facebook_pages").delete().eq("page_id", pageId);
  await appendActivity("facebook.page.deleted", "Đã ngắt kết nối Facebook Page", { page_id: pageId });
}

export async function getAutomationSettings() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return getLocalAutomationSettings();
  const { data, error } = await supabase.from("settings").select("value").eq("key", "automation").maybeSingle();
  if (error || !data?.value) return getLocalAutomationSettings();
  return { ...getLocalAutomationSettings(), ...(data.value as Partial<AutomationSettings>) };
}

export async function saveAutomationSettings(settings: AutomationSettings) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return saveLocalAutomationSettings(settings);
  const { error } = await supabase.from("settings").upsert({ key: "automation", value: settings, updated_at: nowIso() });
  if (error) return saveLocalAutomationSettings(settings);
  await appendActivity("settings.updated", "Cập nhật cấu hình automation");
  return settings;
}

export async function saveWebhookEvent(event: Omit<WebhookEventLog, "id" | "created_at">) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return saveLocalWebhookEvent(event);
  const existing = await supabase.from("webhook_events").select("*").eq("event_key", event.event_key).maybeSingle();
  if (existing.data) return { event: existing.data as WebhookEventLog, duplicate: true };
  const { data, error } = await supabase.from("webhook_events").insert(event).select("*").single();
  if (error) return saveLocalWebhookEvent(event);
  return { event: data as WebhookEventLog, duplicate: false };
}

export async function markWebhookEventProcessed(eventKey: string, patch: { processed: boolean; processing_error?: string | null; payload?: Record<string, unknown> }) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    const saved = saveLocalWebhookEvent({
      event_key: eventKey,
      page_id: null,
      event_type: "debug",
      payload: patch.payload ?? {},
      processed: patch.processed,
      processing_error: patch.processing_error ?? null
    });
    return saved.event;
  }
  const payload: Record<string, unknown> = {
    processed: patch.processed,
    processing_error: patch.processing_error ?? null
  };
  if (patch.payload) payload.payload = patch.payload;
  const { data } = await supabase.from("webhook_events").update(payload).eq("event_key", eventKey).select("*").maybeSingle();
  return data as WebhookEventLog | null;
}

export async function getFacebookWebhookDiagnostics() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("webhook_events").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return [];
  return (data ?? []) as WebhookEventLog[];
}

export async function upsertComment(comment: Omit<FacebookComment, "id" | "created_at" | "updated_at">) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return upsertLocalComment(comment);
  const { data, error } = await supabase.from("comments").upsert(comment, { onConflict: "comment_id" }).select("*").single();
  if (error) return upsertLocalComment(comment);
  return data as FacebookComment;
}

export async function listComments() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return listLocalComments();
  const { data, error } = await supabase.from("comments").select("*").order("created_at", { ascending: false });
  if (error) return listLocalComments();
  return (data ?? []) as FacebookComment[];
}

export async function updateComment(commentId: string, patch: Partial<FacebookComment>) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return updateLocalComment(commentId, patch);
  const { data, error } = await supabase.from("comments").update({ ...patch, updated_at: nowIso() }).eq("comment_id", commentId).select("*").maybeSingle();
  if (error) return updateLocalComment(commentId, patch);
  return data as FacebookComment | null;
}

export async function createOrder(order: Omit<Order, "id" | "created_at" | "updated_at">, items: Array<Omit<OrderItem, "id" | "order_id" | "created_at">>) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return createLocalOrder(order, items);
  const inserted = await supabase.from("orders").insert(order).select("*").single();
  if (inserted.error) return createLocalOrder(order, items);
  const savedOrder = inserted.data as Order;
  const insertedItems = await supabase
    .from("order_items")
    .insert(items.map((item) => ({ ...item, order_id: savedOrder.id })))
    .select("*");
  await appendActivity("order.created", `Tạo đơn hàng cho ${savedOrder.phone}`, { order_id: savedOrder.id });
  return { order: savedOrder, items: (insertedItems.data ?? []) as OrderItem[] };
}

export async function listOrders() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return listLocalOrders();
  const { data, error } = await supabase.from("orders").select("*, items:order_items(*)").order("created_at", { ascending: false });
  if (error) return listLocalOrders();
  return data ?? [];
}

export async function appendActivity(type: string, message: string, payload?: Record<string, unknown>) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return logActivity(type, message, payload);
  const { data, error } = await supabase.from("activity_logs").insert({ type, message, payload: payload ?? {} }).select("*").single();
  if (error) return logActivity(type, message, payload);
  return data;
}

export async function listActivityLogs() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return listLocalActivityLogs();
  const { data, error } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) return listLocalActivityLogs();
  return data ?? [];
}

function maskToken(token: string) {
  if (token.length <= 10) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}
