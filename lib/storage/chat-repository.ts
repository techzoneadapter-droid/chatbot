import { initialState, mergeState } from "@/lib/ai/conversation-memory";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Conversation, ConversationState, Lead, LeadStatus, Message, Platform, SalesEngineOutput } from "@/lib/types";
import { nowIso } from "@/lib/utils/time";
import {
  addMessage as addLocalMessage,
  dashboardStats as localDashboardStats,
  getMessageByFacebookId as getLocalMessageByFacebookId,
  getMessages as getLocalMessages,
  getOrCreateConversation as getOrCreateLocalConversation,
  getState as getLocalState,
  listConversationRows as listLocalConversationRows,
  resetConversation as resetLocalConversation,
  setAiEnabled as setLocalAiEnabled,
  store,
  updateConversation as updateLocalConversation,
  updateLeadStatus as updateLocalLeadStatus,
  updateState as updateLocalState,
  upsertLeadFromState as upsertLocalLeadFromState
} from "@/lib/storage/local-store";

export interface ConversationRow extends Conversation {
  state: ConversationState;
  messages: Message[];
}

export interface ChatRepository {
  mode: "local" | "supabase";
  getOrCreateConversation(externalUserId?: string, platform?: Platform, pageId?: string | null): Promise<Conversation>;
  getConversationById(conversationId: string): Promise<Conversation | null>;
  resetConversation(externalUserId?: string): Promise<Conversation>;
  addMessage(conversationId: string, senderType: Message["sender_type"], message: string, metadata?: Record<string, unknown>): Promise<Message>;
  getMessageByFacebookId(facebookMessageId: string): Promise<Message | null>;
  getMessages(conversationId: string, options?: { limit?: number; before?: string | null; after?: string | null }): Promise<Message[]>;
  getState(conversationId: string): Promise<ConversationState>;
  updateState(conversationId: string, output: SalesEngineOutput): Promise<ConversationState>;
  upsertLeadFromState(conversationId: string, output: SalesEngineOutput): Promise<Lead>;
  setAiEnabled(conversationId: string, enabled: boolean): Promise<Conversation | null>;
  setHumanTakeover(conversationId: string, enabled: boolean): Promise<Conversation | null>;
  updateConversation(conversationId: string, patch: Partial<Conversation>): Promise<Conversation | null>;
  updateCustomerProfile(conversationId: string, profile: { name?: string | null; avatar?: string | null; pageId?: string | null; psid?: string | null }): Promise<void>;
  updateConversationSummary(conversationId: string, summary: string | null): Promise<void>;
  listConversations(options?: { limit?: number; cursor?: string | null; after?: string | null; search?: string | null; pageId?: string | null; messageLimit?: number }): Promise<ConversationRow[]>;
  listLeads(): Promise<Lead[]>;
  updateLeadStatus(id: string, status: LeadStatus): Promise<Lead[]>;
  dashboardStats(): Promise<{
    totalConversations: number;
    todaysConversations: number;
    newLeads: number;
    qualifiedLeads: number;
    hotLeads: number;
    phoneNumbers: number;
    conversionRate: number;
  }>;
}

function sourceForPlatform(platform: Platform) {
  return platform === "facebook" ? "facebook_messenger" : "local_chat";
}

function cleanMetadata(metadata?: Record<string, unknown>) {
  return metadata ?? {};
}

class LocalChatRepository implements ChatRepository {
  mode = "local" as const;

  async getOrCreateConversation(externalUserId = "local-demo", platform: Platform = "local", pageId?: string | null) {
    return getOrCreateLocalConversation(externalUserId, platform, pageId);
  }

  async getConversationById(conversationId: string) {
    return store.conversations.find((conversation) => conversation.id === conversationId) ?? null;
  }

  async resetConversation(externalUserId = "local-demo") {
    return resetLocalConversation(externalUserId);
  }

  async addMessage(conversationId: string, senderType: Message["sender_type"], message: string, metadata?: Record<string, unknown>) {
    return addLocalMessage(conversationId, senderType, message, metadata);
  }

  async getMessageByFacebookId(facebookMessageId: string) {
    return getLocalMessageByFacebookId(facebookMessageId);
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: string | null; after?: string | null } = {}) {
    const rows = getLocalMessages(conversationId);
    const before = options.before ? new Date(options.before).getTime() : null;
    const after = options.after ? new Date(options.after).getTime() : null;
    const filtered = rows.filter((message) => {
      const at = new Date(message.created_at).getTime();
      return (before ? at < before : true) && (after ? at > after : true);
    });
    return filtered.slice(-(options.limit ?? 50));
  }

  async getState(conversationId: string) {
    return getLocalState(conversationId);
  }

  async updateState(conversationId: string, output: SalesEngineOutput) {
    return updateLocalState(conversationId, output);
  }

  async upsertLeadFromState(conversationId: string, output: SalesEngineOutput) {
    return upsertLocalLeadFromState(conversationId, output);
  }

  async setAiEnabled(conversationId: string, enabled: boolean) {
    return setLocalAiEnabled(conversationId, enabled) ?? null;
  }

  async setHumanTakeover(conversationId: string, enabled: boolean) {
    return updateLocalConversation(conversationId, { human_takeover: enabled, ai_enabled: !enabled, status: enabled ? "HUMAN" : "OPEN" }) ?? null;
  }

  async updateConversation(conversationId: string, patch: Partial<Conversation>) {
    return updateLocalConversation(conversationId, patch) ?? null;
  }

  async updateCustomerProfile(conversationId: string, profile: { name?: string | null; avatar?: string | null; pageId?: string | null; psid?: string | null }) {
    updateLocalConversation(conversationId, {
      customer_name: profile.name ?? undefined,
      customer_avatar_url: profile.avatar ?? undefined,
      customer_psid: profile.psid ?? undefined,
      page_id: profile.pageId ?? undefined
    });
  }

  async updateConversationSummary(conversationId: string, summary: string | null) {
    const state = getLocalState(conversationId);
    state.conversation_summary = summary;
    state.updated_at = nowIso();
  }

  async listConversations(options: { limit?: number; cursor?: string | null; after?: string | null; search?: string | null; pageId?: string | null; messageLimit?: number } = {}) {
    const limit = options.limit ?? 50;
    const cursor = options.cursor ? new Date(options.cursor).getTime() : null;
    const after = options.after ? new Date(options.after).getTime() : null;
    const search = options.search?.trim().toLowerCase();
    return listLocalConversationRows()
      .filter((row) => (options.pageId ? row.page_id === options.pageId : true))
      .filter((row) => (cursor ? new Date(row.last_message_at ?? row.updated_at).getTime() < cursor : true))
      .filter((row) => (after ? new Date(row.last_message_at ?? row.updated_at).getTime() > after : true))
      .filter((row) => {
        if (!search) return true;
        return [row.customer_name, row.external_user_id, row.customer_psid, row.last_message, row.state.collected_phone, ...row.messages.map((message) => message.message)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .slice(0, limit);
  }

  async listLeads() {
    return store.leads;
  }

  async updateLeadStatus(id: string, status: LeadStatus) {
    return updateLocalLeadStatus(id, status);
  }

  async dashboardStats() {
    return localDashboardStats();
  }
}

export class SupabaseChatRepository implements ChatRepository {
  mode = "supabase" as const;

  constructor(private readonly supabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>) {}

  async getOrCreateConversation(externalUserId = "local-demo", platform: Platform = "local", pageId?: string | null) {
    const normalizedPageId = pageId ?? null;
    const customer = await this.getOrCreateCustomer(externalUserId, platform, normalizedPageId);
    let existingQuery = this.supabase
      .from("conversations")
      .select("*")
      .eq("external_user_id", externalUserId)
      .eq("platform", platform)
      .order("created_at", { ascending: false })
      .limit(1);
    existingQuery = normalizedPageId ? existingQuery.eq("page_id", normalizedPageId) : nullableEq(existingQuery, "page_id", null);
    const existing = await existingQuery.maybeSingle();

    if (existing.data) return existing.data as Conversation;

    const inserted = await this.supabase
      .from("conversations")
      .insert({
        external_user_id: externalUserId,
        customer_psid: platform === "facebook" ? externalUserId : null,
        platform,
        page_id: normalizedPageId,
        customer_id: customer.id,
        unread_count: 0,
        human_takeover: false
      })
      .select("*")
      .single();
    if (inserted.error) throw new Error(`Failed to create conversation: ${inserted.error.message}`);
    await this.ensureState((inserted.data as Conversation).id);
    return inserted.data as Conversation;
  }

  async resetConversation(externalUserId = "local-demo") {
    const conversation = await this.getOrCreateConversation(externalUserId, "local");
    await this.supabase.from("messages").delete().eq("conversation_id", conversation.id);
    await this.supabase.from("lead_events").delete().eq("conversation_id", conversation.id);
    await this.supabase.from("leads").delete().eq("conversation_id", conversation.id);
    await this.supabase.from("conversation_state").delete().eq("conversation_id", conversation.id);
    await this.ensureState(conversation.id);
    const updated = await this.setAiEnabled(conversation.id, true);
    return updated ?? conversation;
  }

  async addMessage(conversationId: string, senderType: Message["sender_type"], message: string, metadata?: Record<string, unknown>) {
    const conversation = await this.getConversationById(conversationId);
    const facebookMessageId =
      typeof metadata?.mid === "string"
        ? metadata.mid
        : typeof metadata?.facebook_message_id === "string"
          ? metadata.facebook_message_id
          : typeof (metadata?.messenger_result as { message_id?: unknown } | undefined)?.message_id === "string"
            ? String((metadata?.messenger_result as { message_id?: unknown }).message_id)
            : null;
    if (facebookMessageId) {
      const existing = await this.supabase.from("messages").select("*").eq("facebook_message_id", facebookMessageId).maybeSingle();
      if (existing.data) return existing.data as Message;
    }
    const inserted = await this.supabase
      .from("messages")
      .insert({
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
        metadata: cleanMetadata(metadata),
        created_at: typeof metadata?.createdTime === "string" ? metadata.createdTime : nowIso()
      })
      .select("*")
      .single();
    if (inserted.error) throw new Error(`Failed to save message: ${inserted.error.message}`);
    await this.supabase
      .from("conversations")
      .update({
        last_message: message,
        last_message_at: (inserted.data as Message).created_at,
        last_customer_message_at: senderType === "customer" ? (inserted.data as Message).created_at : conversation?.last_customer_message_at ?? null,
        unread_count: senderType === "customer" ? (conversation?.unread_count ?? 0) + 1 : 0,
        updated_at: nowIso()
      })
      .eq("id", conversationId);
    return inserted.data as Message;
  }

  async getMessageByFacebookId(facebookMessageId: string) {
    const { data, error } = await this.supabase.from("messages").select("*").eq("facebook_message_id", facebookMessageId).maybeSingle();
    if (error) throw new Error(`Failed to load Facebook message: ${error.message}`);
    return (data as Message | null) ?? null;
  }

  async getMessages(conversationId: string, options: { limit?: number; before?: string | null; after?: string | null } = {}) {
    let query = this.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(Math.min(100, Math.max(10, options.limit ?? 50)));
    if (options.before) query = query.lt("created_at", options.before);
    if (options.after) query = query.gt("created_at", options.after);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load messages: ${error.message}`);
    return ((data ?? []) as Message[]).reverse();
  }

  async getState(conversationId: string) {
    return this.ensureState(conversationId);
  }

  async updateState(conversationId: string, output: SalesEngineOutput) {
    const current = await this.ensureState(conversationId);
    const updated = mergeState(current, output);
    const { error } = await this.supabase.from("conversation_state").upsert({
      conversation_id: conversationId,
      current_intent: updated.current_intent,
      lead_score: updated.lead_score,
      scored_signals: updated.scored_signals ?? [],
      collected_name: updated.collected_name,
      collected_phone: updated.collected_phone,
      collected_location: updated.collected_location,
      collected_address: updated.collected_address,
      collected_quantity: updated.collected_quantity,
      collected_floors: updated.collected_floors,
      collected_project_type: updated.collected_project_type,
      collected_area: updated.collected_area,
      collected_product_interest: updated.collected_product_interest,
      collected_budget: updated.collected_budget,
      last_question: updated.last_question,
      qualification_stage: updated.qualification_stage,
      sales_state: updated.sales_state,
      should_request_phone: updated.should_request_phone ?? false,
      should_handoff: updated.should_handoff ?? false,
      conversation_summary: updated.conversation_summary ?? null,
      ai_confidence_status: output.confidence_status ?? updated.ai_confidence_status ?? null,
      last_ai_reply_at: output.provider ? nowIso() : updated.last_ai_reply_at ?? null,
      updated_at: updated.updated_at
    });
    if (error) throw new Error(`Failed to update conversation state: ${error.message}`);
    return updated;
  }

  async upsertLeadFromState(conversationId: string, output: SalesEngineOutput) {
    const state = await this.ensureState(conversationId);
    const conversation = await this.getConversationById(conversationId);
    const existing = await this.supabase.from("leads").select("*").eq("conversation_id", conversationId).maybeSingle();
    if (existing.error) throw new Error(`Failed to load lead: ${existing.error.message}`);

    const interested = state.collected_product_interest ? [state.collected_product_interest] : output.recommendations;
    const status: LeadStatus = state.collected_phone ? "QUALIFIED" : "NEW";
    const payload = {
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
      source: sourceForPlatform(conversation?.platform ?? "local"),
      intent: output.intent,
      lead_score: output.lead_score,
      status,
      notes: output.should_handoff ? "Needs human takeover." : null,
      updated_at: nowIso()
    };

    const saved = existing.data
      ? await this.supabase.from("leads").update(payload).eq("id", existing.data.id).select("*").single()
      : await this.supabase.from("leads").insert({ ...payload, created_at: nowIso() }).select("*").single();

    if (saved.error) throw new Error(`Failed to save lead: ${saved.error.message}`);
    const lead = saved.data as Lead;
    await this.updateCustomerFromState(conversationId, state);

    const hadPhone = Boolean((existing.data as Lead | null)?.normalized_phone);
    if (state.collected_phone && !hadPhone) {
      await this.supabase.from("lead_events").insert({
        lead_id: lead.id,
        conversation_id: conversationId,
        event_type: "phone_captured",
        payload: { phone: state.collected_phone, lead_score: output.lead_score }
      });
    }

    return lead;
  }

  async setAiEnabled(conversationId: string, enabled: boolean) {
    const { data, error } = await this.supabase
      .from("conversations")
      .update({ ai_enabled: enabled, human_takeover: !enabled, status: enabled ? "OPEN" : "HUMAN", updated_at: nowIso() })
      .eq("id", conversationId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to update AI status: ${error.message}`);
    return (data as Conversation | null) ?? null;
  }

  async setHumanTakeover(conversationId: string, enabled: boolean) {
    const { data, error } = await this.supabase
      .from("conversations")
      .update({ human_takeover: enabled, ai_enabled: !enabled, status: enabled ? "HUMAN" : "OPEN", updated_at: nowIso() })
      .eq("id", conversationId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to update takeover status: ${error.message}`);
    return (data as Conversation | null) ?? null;
  }

  async updateConversation(conversationId: string, patch: Partial<Conversation>) {
    const { id: _id, created_at: _createdAt, ...safePatch } = patch;
    const { data, error } = await this.supabase
      .from("conversations")
      .update({ ...safePatch, updated_at: nowIso() })
      .eq("id", conversationId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
    return (data as Conversation | null) ?? null;
  }

  async updateCustomerProfile(conversationId: string, profile: { name?: string | null; avatar?: string | null; pageId?: string | null; psid?: string | null }) {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation?.customer_id) return;
    const metadata = {
      avatar_url: profile.avatar ?? conversation.customer_avatar_url ?? null,
      page_id: profile.pageId ?? conversation.page_id ?? null,
      psid: profile.psid ?? conversation.customer_psid ?? conversation.external_user_id
    };
    await this.supabase
      .from("customers")
      .update({
        name: profile.name ?? conversation.customer_name ?? null,
        page_id: profile.pageId ?? conversation.page_id ?? null,
        metadata,
        updated_at: nowIso()
      })
      .eq("id", conversation.customer_id);
  }

  async updateConversationSummary(conversationId: string, summary: string | null) {
    const { error } = await this.supabase
      .from("conversation_state")
      .update({ conversation_summary: summary, updated_at: nowIso() })
      .eq("conversation_id", conversationId);
    if (error) throw new Error(`Failed to update conversation summary: ${error.message}`);
  }

  async listConversations(options: { limit?: number; cursor?: string | null; after?: string | null; search?: string | null; pageId?: string | null; messageLimit?: number } = {}) {
    const limit = Math.min(100, Math.max(10, options.limit ?? 50));
    const messageLimit = Math.min(50, Math.max(0, options.messageLimit ?? 50));
    const search = options.search?.trim();
    let query = this.supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (options.cursor) query = query.lt("last_message_at", options.cursor);
    if (options.after) query = query.gt("last_message_at", options.after);
    if (options.pageId) query = query.eq("page_id", options.pageId);
    if (search) {
      const safeSearch = search.replace(/[%_]/g, "\\$&");
      query = query.or(`customer_name.ilike.%${safeSearch}%,customer_psid.ilike.%${safeSearch}%,external_user_id.ilike.%${safeSearch}%,last_message.ilike.%${safeSearch}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list conversations: ${error.message}`);
    const conversations = (data ?? []) as Conversation[];
    if (!conversations.length) return [];
    const ids = conversations.map((conversation) => conversation.id);
    const stateQuery = this.supabase.from("conversation_state").select("*") as unknown as { in?: (column: string, values: string[]) => Promise<{ data: ConversationState[] | null; error: { message: string } | null }> };
    if (typeof stateQuery.in !== "function") {
      return Promise.all(
        conversations.map(async (conversation) => ({
          ...conversation,
          state: await this.ensureState(conversation.id),
          messages: messageLimit ? await this.getMessages(conversation.id, { limit: messageLimit }) : []
        }))
      );
    }
    const messageQuery = messageLimit
      ? this.supabase.from("messages").select("*").in("conversation_id", ids).order("created_at", { ascending: false }).limit(limit * messageLimit)
      : Promise.resolve({ data: [], error: null });
    const [stateResult, messageResult] = await Promise.all([
      this.supabase.from("conversation_state").select("*").in("conversation_id", ids),
      messageQuery
    ]);
    if (stateResult.error) throw new Error(`Failed to load conversation states: ${stateResult.error.message}`);
    if (messageResult.error) throw new Error(`Failed to load messages: ${messageResult.error.message}`);
    const states = new Map(((stateResult.data ?? []) as ConversationState[]).map((state) => [state.conversation_id, state]));
    const messagesByConversation = new Map<string, Message[]>();
    for (const message of (messageResult.data ?? []) as Message[]) {
      const bucket = messagesByConversation.get(message.conversation_id) ?? [];
      if (bucket.length < messageLimit) {
        bucket.push(message);
        messagesByConversation.set(message.conversation_id, bucket);
      }
    }
    return conversations.map((conversation) => ({
      ...conversation,
      state: states.get(conversation.id) ?? initialState(conversation.id),
      messages: (messagesByConversation.get(conversation.id) ?? []).reverse()
    }));
  }

  async listLeads() {
    const { data, error } = await this.supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list leads: ${error.message}`);
    return (data ?? []) as Lead[];
  }

  async updateLeadStatus(id: string, status: LeadStatus) {
    const { error } = await this.supabase.from("leads").update({ status, updated_at: nowIso() }).eq("id", id);
    if (error) throw new Error(`Failed to update lead status: ${error.message}`);
    return this.listLeads();
  }

  async dashboardStats() {
    const [conversations, leads] = await Promise.all([this.listConversations(), this.listLeads()]);
    const today = new Date().toISOString().slice(0, 10);
    const phones = leads.filter((lead) => lead.normalized_phone).length;
    return {
      totalConversations: conversations.length,
      todaysConversations: conversations.filter((item) => item.created_at.startsWith(today)).length,
      newLeads: leads.filter((lead) => lead.status === "NEW").length,
      qualifiedLeads: leads.filter((lead) => lead.status === "QUALIFIED").length,
      hotLeads: leads.filter((lead) => lead.lead_score >= 70).length,
      phoneNumbers: phones,
      conversionRate: conversations.length ? Math.round((phones / conversations.length) * 100) : 0
    };
  }

  private async getOrCreateCustomer(externalUserId: string, platform: Platform, pageId: string | null) {
    let existingQuery = this.supabase.from("customers").select("*").eq("external_user_id", externalUserId).eq("platform", platform);
    existingQuery = pageId ? existingQuery.eq("page_id", pageId) : nullableEq(existingQuery, "page_id", null);
    const existing = await existingQuery.maybeSingle();
    if (existing.data) return existing.data as { id: string };
    const inserted = await this.supabase.from("customers").insert({ external_user_id: externalUserId, platform, page_id: pageId }).select("*").single();
    if (inserted.error) throw new Error(`Failed to create customer: ${inserted.error.message}`);
    return inserted.data as { id: string };
  }

  async getConversationById(conversationId: string) {
    const { data } = await this.supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle();
    return data as Conversation | null;
  }

  private async ensureState(conversationId: string) {
    const { data, error } = await this.supabase.from("conversation_state").select("*").eq("conversation_id", conversationId).maybeSingle();
    if (error) throw new Error(`Failed to load conversation state: ${error.message}`);
    if (data) return data as ConversationState;

    const state = initialState(conversationId);
    const inserted = await this.supabase.from("conversation_state").insert(state).select("*").single();
    if (inserted.error) throw new Error(`Failed to create conversation state: ${inserted.error.message}`);
    return inserted.data as ConversationState;
  }

  private async updateCustomerFromState(conversationId: string, state: ConversationState) {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation?.customer_id) return;
    await this.supabase
      .from("customers")
      .update({
        name: state.collected_name,
        phone: state.collected_phone,
        location: state.collected_location,
        updated_at: nowIso()
      })
      .eq("id", conversation.customer_id);
  }
}

function nullableEq<T extends { eq: (column: string, value: unknown) => T }>(query: T, column: string, value: null) {
  const maybeIs = query as T & { is?: (column: string, value: null) => T };
  return typeof maybeIs.is === "function" ? maybeIs.is(column, value) : query.eq(column, value);
}

export function createChatRepository(): ChatRepository {
  const supabase = createServiceSupabaseClient();
  return supabase ? new SupabaseChatRepository(supabase) : new LocalChatRepository();
}
