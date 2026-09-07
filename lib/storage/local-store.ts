import { initialState, mergeState } from "@/lib/ai/conversation-memory";
import { DEFAULT_COMMENT_HIDE_MODE, normalizeCommentHideMode } from "@/lib/facebook/comment-hide-mode";
import { demoProducts } from "@/lib/products/demo-products";
import type {
  AutomationSettings,
  Conversation,
  ConversationState,
  FacebookComment,
  FacebookPage,
  Lead,
  Message,
  Order,
  OrderItem,
  Product,
  SalesEngineOutput,
  WebhookEventLog
} from "@/lib/types";
import { createId } from "@/lib/utils/id";
import { nowIso } from "@/lib/utils/time";

interface Store {
  conversations: Conversation[];
  messages: Message[];
  states: ConversationState[];
  leads: Lead[];
  products: Product[];
  facebookPages: FacebookPage[];
  comments: FacebookComment[];
  orders: Order[];
  orderItems: OrderItem[];
  webhookEvents: WebhookEventLog[];
  activityLogs: Array<{ id: string; type: string; message: string; payload?: Record<string, unknown>; created_at: string }>;
  automationSettings: AutomationSettings;
}

const globalStore = globalThis as typeof globalThis & { paintChatStore?: Store };

export const store: Store =
  globalStore.paintChatStore ??
  (globalStore.paintChatStore = {
    conversations: [],
    messages: [],
    states: [],
    leads: [],
    products: [...demoProducts],
    facebookPages: [],
    comments: [],
    orders: [],
    orderItems: [],
    webhookEvents: [],
    activityLogs: [],
    automationSettings: {
      messenger: { autoReply: true, aiSalesMode: true, autoHandoff: true },
      comment: { autoLike: true, autoReply: true, autoHidePhone: true, autoHideBlacklist: true },
      blacklistKeywords: ["sdt", "số điện thoại", "phone", "ib giá", "inbox giá"],
      greeting: "Dạ em chào anh/chị, em có thể tư vấn sản phẩm và ghi nhận đơn giúp mình ạ.",
      fallbackReply: "Dạ thông tin này em chưa có dữ liệu chính xác, em sẽ chuyển nhân viên tư vấn lại cho mình ạ.",
      commentReplyStyle: "Ngắn gọn, lịch sự, mời khách kiểm tra inbox khi cần báo giá.",
      maxConsecutiveBotReplies: 4,
      businessHours: "08:00-21:00",
      handoffRules: ["Khách yêu cầu gặp nhân viên", "Khiếu nại", "AI thiếu tự tin", "Thiếu dữ liệu chính sách/giá"],
      brandKnowledge: "",
      faq: "",
      salesPolicies: ""
    }
  });

export function getOrCreateConversation(externalUserId = "local-demo", platform: Conversation["platform"] = "local", pageId?: string | null) {
  const normalizedPageId = pageId ?? null;
  const existing = store.conversations.find((item) => item.external_user_id === externalUserId && item.platform === platform && (item.page_id ?? null) === normalizedPageId);
  if (existing) return existing;
  const created: Conversation = {
    id: createId("conv"),
    platform,
    external_user_id: externalUserId,
    page_id: normalizedPageId,
    customer_psid: platform === "facebook" ? externalUserId : null,
    customer_name: null,
    customer_avatar_url: null,
    last_message: null,
    last_message_at: null,
    unread_count: 0,
    human_takeover: false,
    customer_id: null,
    status: "OPEN",
    ai_enabled: true,
    assigned_staff_id: null,
    last_campaign_at: null,
    last_customer_message_at: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  store.conversations.unshift(created);
  store.states.push(initialState(created.id));
  return created;
}

export function resetConversation(externalUserId = "local-demo") {
  const conversation = store.conversations.find((item) => item.external_user_id === externalUserId && item.platform === "local");
  if (!conversation) return getOrCreateConversation(externalUserId);
  store.messages = store.messages.filter((message) => message.conversation_id !== conversation.id);
  store.leads = store.leads.filter((lead) => lead.conversation_id !== conversation.id);
  store.states = store.states.filter((state) => state.conversation_id !== conversation.id);
  store.states.push(initialState(conversation.id));
  conversation.ai_enabled = true;
  conversation.status = "OPEN";
  conversation.updated_at = nowIso();
  return conversation;
}

export function addMessage(conversationId: string, senderType: Message["sender_type"], message: string, metadata?: Record<string, unknown>) {
  const conversation = store.conversations.find((item) => item.id === conversationId);
  const facebookMessageId = (metadata?.mid as string | undefined) ?? (metadata?.facebook_message_id as string | undefined) ?? null;
  if (facebookMessageId) {
    const existing = store.messages.find((item) => item.facebook_message_id === facebookMessageId);
    if (existing) return existing;
  }
  const row: Message = {
    id: createId("msg"),
    conversation_id: conversationId,
    page_id: (metadata?.pageId as string | undefined) ?? conversation?.page_id ?? null,
    customer_psid: conversation?.customer_psid ?? conversation?.external_user_id ?? null,
    facebook_message_id: facebookMessageId,
    sender_type: senderType,
    direction: senderType === "customer" ? "inbound" : senderType === "system" ? "internal" : "outbound",
    message,
    text: message,
    ai_generated: senderType === "ai",
    status: (metadata?.status as Message["status"] | undefined) ?? (senderType === "customer" ? "received" : "sent"),
    metadata,
    created_at: typeof metadata?.createdTime === "string" ? metadata.createdTime : nowIso()
  };
  store.messages.push(row);
  if (conversation) {
    conversation.last_message = message;
    conversation.last_message_at = row.created_at;
    if (senderType === "customer") conversation.last_customer_message_at = row.created_at;
    conversation.unread_count = senderType === "customer" ? (conversation.unread_count ?? 0) + 1 : 0;
    conversation.updated_at = nowIso();
  }
  return row;
}

export function getMessages(conversationId: string) {
  return store.messages.filter((message) => message.conversation_id === conversationId);
}

export function getMessageByFacebookId(facebookMessageId: string) {
  return store.messages.find((message) => message.facebook_message_id === facebookMessageId) ?? null;
}

export function getState(conversationId: string) {
  let state = store.states.find((item) => item.conversation_id === conversationId);
  if (!state) {
    state = initialState(conversationId);
    store.states.push(state);
  }
  return state;
}

export function updateState(conversationId: string, output: SalesEngineOutput) {
  const current = getState(conversationId);
  const updated = mergeState(current, output);
  store.states = store.states.map((state) => (state.conversation_id === conversationId ? updated : state));
  return updated;
}

export function upsertLeadFromState(conversationId: string, output: SalesEngineOutput) {
  const state = getState(conversationId);
  const conversation = store.conversations.find((item) => item.id === conversationId);
  const existing = store.leads.find((lead) => lead.conversation_id === conversationId);
  const interested = state.collected_product_interest ? [state.collected_product_interest] : output.recommendations;
  const status: Lead["status"] = state.collected_phone ? "QUALIFIED" : "NEW";
  const lead: Lead = {
    id: existing?.id ?? createId("lead"),
    conversation_id: conversationId,
    page_id: conversation?.page_id ?? null,
    customer_psid: conversation?.customer_psid ?? conversation?.external_user_id ?? null,
    customer_name: state.collected_name,
    phone: state.collected_phone,
    normalized_phone: state.collected_phone,
    location: state.collected_location,
    address: state.collected_address,
    project_type: state.collected_project_type,
    area: state.collected_area,
    floors: state.collected_floors,
    interested_products: interested,
    budget: state.collected_budget,
    source: conversation?.platform === "facebook" ? "facebook_messenger" : "local_chat",
    intent: output.intent,
    lead_score: output.lead_score,
    status,
    notes: output.should_handoff ? "Cần nhân viên tiếp quản." : null,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
  if (existing) store.leads = store.leads.map((item) => (item.id === existing.id ? lead : item));
  else store.leads.unshift(lead);
  return lead;
}

export function logActivity(type: string, message: string, payload?: Record<string, unknown>) {
  const row = { id: createId("act"), type, message, payload, created_at: nowIso() };
  store.activityLogs.unshift(row);
  store.activityLogs = store.activityLogs.slice(0, 300);
  return row;
}

export function getAutomationSettings() {
  return store.automationSettings;
}

export function saveAutomationSettings(settings: AutomationSettings) {
  store.automationSettings = settings;
  logActivity("settings.updated", "Cập nhật cấu hình automation");
  return store.automationSettings;
}

export function upsertFacebookPage(input: Partial<FacebookPage> & { page_id: string; page_name: string }) {
  const existing = store.facebookPages.find((page) => page.page_id === input.page_id);
  const token = input.page_access_token ?? existing?.page_access_token ?? null;
  const row: FacebookPage = {
    id: existing?.id ?? createId("fbpage"),
    page_id: input.page_id,
    page_name: input.page_name,
    page_avatar_url: input.page_avatar_url ?? existing?.page_avatar_url ?? null,
    page_access_token: token,
    token_mask: token ? maskToken(token) : null,
    connected: input.connected ?? existing?.connected ?? Boolean(token),
    webhook_status: input.webhook_status ?? existing?.webhook_status ?? "unknown",
    last_webhook_at: input.last_webhook_at ?? existing?.last_webhook_at ?? null,
    last_connection_check_at: input.last_connection_check_at ?? existing?.last_connection_check_at ?? null,
    granted_permissions: input.granted_permissions ?? existing?.granted_permissions ?? [],
    missing_permissions: input.missing_permissions ?? existing?.missing_permissions ?? [],
    automation_enabled: input.automation_enabled ?? existing?.automation_enabled ?? true,
    auto_reply_messenger: input.auto_reply_messenger ?? existing?.auto_reply_messenger ?? true,
    ai_sales_mode: input.ai_sales_mode ?? existing?.ai_sales_mode ?? true,
    auto_handoff: input.auto_handoff ?? existing?.auto_handoff ?? true,
    auto_like_comments: input.auto_like_comments ?? existing?.auto_like_comments ?? true,
    auto_reply_comments: input.auto_reply_comments ?? existing?.auto_reply_comments ?? true,
    auto_hide_comments: input.auto_hide_comments ?? existing?.auto_hide_comments ?? true,
    comment_hide_mode: normalizeCommentHideMode(input.comment_hide_mode) ?? normalizeCommentHideMode(existing?.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE,
    hide_phone_comments: input.hide_phone_comments ?? existing?.hide_phone_comments ?? true,
    hide_keyword_comments: input.hide_keyword_comments ?? existing?.hide_keyword_comments ?? true,
    ai_reply_delay_seconds: input.ai_reply_delay_seconds ?? existing?.ai_reply_delay_seconds ?? 3,
    ai_provider: input.ai_provider ?? existing?.ai_provider ?? "openai",
    ai_model: input.ai_model ?? existing?.ai_model ?? null,
    ai_fallback_provider: input.ai_fallback_provider ?? existing?.ai_fallback_provider ?? null,
    ai_provider_fallback_enabled: input.ai_provider_fallback_enabled ?? existing?.ai_provider_fallback_enabled ?? false,
    ai_business_name: input.ai_business_name ?? existing?.ai_business_name ?? null,
    ai_system_prompt: input.ai_system_prompt ?? existing?.ai_system_prompt ?? null,
    ai_tone: input.ai_tone ?? existing?.ai_tone ?? null,
    ai_sales_goal: input.ai_sales_goal ?? existing?.ai_sales_goal ?? null,
    ai_product_context: input.ai_product_context ?? existing?.ai_product_context ?? null,
    ai_faq_context: input.ai_faq_context ?? existing?.ai_faq_context ?? null,
    ai_allowed_topics: input.ai_allowed_topics ?? existing?.ai_allowed_topics ?? null,
    ai_fallback_message: input.ai_fallback_message ?? existing?.ai_fallback_message ?? null,
    chat_rules: input.chat_rules ?? existing?.chat_rules ?? {
      ai_auto_reply: true,
      human_takeover_default: false,
      max_response_length: 900,
      allow_emoji: true,
      ask_phone: true,
      ask_address: true,
      auto_close_order: false,
      auto_send_price: false,
      after_hours_reply: true,
      business_hours: "08:00-21:00",
      after_hours_fallback: "Dạ hiện đã ngoài giờ làm việc, nhân viên sẽ phản hồi lại mình sớm nhất ạ.",
      max_ai_followups: 4,
      stop_on_not_interested: true,
      stop_on_human_request: true
    },
    blocked_keywords: input.blocked_keywords ?? existing?.blocked_keywords ?? [],
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
  if (existing) store.facebookPages = store.facebookPages.map((page) => (page.id === existing.id ? row : page));
  else store.facebookPages.unshift(row);
  logActivity("facebook.page.saved", `Đã lưu Facebook Page ${row.page_name}`, { page_id: row.page_id });
  return sanitizeFacebookPage(row);
}

export function listFacebookPages() {
  return store.facebookPages.map(sanitizeFacebookPage);
}

export function getFacebookPage(pageId: string) {
  return store.facebookPages.find((page) => page.page_id === pageId) ?? null;
}

export function deleteFacebookPage(pageId: string) {
  store.facebookPages = store.facebookPages.filter((page) => page.page_id !== pageId);
  logActivity("facebook.page.deleted", "Đã ngắt kết nối Facebook Page", { page_id: pageId });
}

export function saveWebhookEvent(event: Omit<WebhookEventLog, "id" | "created_at">) {
  const existing = store.webhookEvents.find((item) => item.event_key === event.event_key);
  if (existing) return { event: existing, duplicate: true };
  const row = { ...event, id: createId("wh"), created_at: nowIso() };
  store.webhookEvents.unshift(row);
  store.webhookEvents = store.webhookEvents.slice(0, 1000);
  return { event: row, duplicate: false };
}

export function upsertComment(input: Omit<FacebookComment, "id" | "created_at" | "updated_at">) {
  const existing = store.comments.find((comment) => comment.comment_id === input.comment_id);
  const row: FacebookComment = {
    ...input,
    id: existing?.id ?? createId("comment"),
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
  if (existing) store.comments = store.comments.map((comment) => (comment.id === existing.id ? row : comment));
  else store.comments.unshift(row);
  return row;
}

export function listComments() {
  return store.comments;
}

export function updateComment(commentId: string, patch: Partial<FacebookComment>) {
  store.comments = store.comments.map((comment) => (comment.comment_id === commentId ? { ...comment, ...patch, updated_at: nowIso() } : comment));
  return store.comments.find((comment) => comment.comment_id === commentId) ?? null;
}

export function createOrder(order: Omit<Order, "id" | "created_at" | "updated_at">, items: Array<Omit<OrderItem, "id" | "order_id" | "created_at">>) {
  const created: Order = { ...order, id: createId("order"), created_at: nowIso(), updated_at: nowIso() };
  const createdItems = items.map((item) => ({ ...item, id: createId("item"), order_id: created.id, created_at: nowIso() }));
  store.orders.unshift(created);
  store.orderItems.unshift(...createdItems);
  logActivity("order.created", `Tạo đơn hàng cho ${created.phone}`, { order_id: created.id });
  return { order: created, items: createdItems };
}

export function listOrders() {
  return store.orders.map((order) => ({ ...order, items: store.orderItems.filter((item) => item.order_id === order.id) }));
}

export function listActivityLogs() {
  return store.activityLogs;
}

function maskToken(token: string) {
  if (token.length <= 10) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export function sanitizeFacebookPage(page: FacebookPage): FacebookPage {
  const { page_access_token: _token, ...rest } = page;
  return {
    ...rest,
    comment_hide_mode: normalizeCommentHideMode(page.comment_hide_mode) ?? DEFAULT_COMMENT_HIDE_MODE,
    page_access_token: null,
    token_mask: page.token_mask ?? (page.page_access_token ? maskToken(page.page_access_token) : null)
  };
}

export function setAiEnabled(conversationId: string, enabled: boolean) {
  const conversation = store.conversations.find((item) => item.id === conversationId);
  if (conversation) {
    conversation.ai_enabled = enabled;
    conversation.human_takeover = !enabled;
    conversation.status = enabled ? "OPEN" : "HUMAN";
    conversation.updated_at = nowIso();
  }
  return conversation;
}

export function updateConversation(conversationId: string, patch: Partial<Conversation>) {
  store.conversations = store.conversations.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, ...patch, updated_at: nowIso() } : conversation
  );
  return store.conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export function updateLeadStatus(id: string, status: Lead["status"]) {
  store.leads = store.leads.map((lead) => (lead.id === id ? { ...lead, status, updated_at: nowIso() } : lead));
  return store.leads;
}

export function listConversationRows() {
  return store.conversations.map((conversation) => ({
    ...conversation,
    state: getState(conversation.id),
    messages: getMessages(conversation.id)
  }));
}

export function dashboardStats() {
  const today = new Date().toISOString().slice(0, 10);
  const total = store.conversations.length;
  const todays = store.conversations.filter((item) => item.created_at.startsWith(today)).length;
  const qualified = store.leads.filter((lead) => lead.status === "QUALIFIED").length;
  const hot = store.leads.filter((lead) => lead.lead_score >= 70).length;
  const phones = store.leads.filter((lead) => lead.normalized_phone).length;
  return {
    totalConversations: total,
    todaysConversations: todays,
    newLeads: store.leads.filter((lead) => lead.status === "NEW").length,
    qualifiedLeads: qualified,
    hotLeads: hot,
    phoneNumbers: phones,
    conversionRate: total ? Math.round((phones / total) * 100) : 0
  };
}
