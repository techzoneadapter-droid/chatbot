import assert from "node:assert/strict";
import { detectIntent } from "@/lib/ai/intent-detector";
import { scoreLead } from "@/lib/ai/lead-scorer";
import { mergeState, initialState } from "@/lib/ai/conversation-memory";
import { detectVietnamesePhone } from "@/lib/ai/phone-detector";
import { runSalesEngine } from "@/lib/ai/sales-engine";
import { LocalFallbackProvider, OpenAIProvider } from "@/lib/ai/providers";
import { POST as postChat } from "@/app/api/chat/route";
import { POST as postWebhook } from "@/app/api/webhook/route";
import { normalizeWebhookBody } from "@/lib/facebook/webhook";
import { estimatePaintQuantity } from "@/lib/products/paint-calculator";
import { recommendProducts } from "@/lib/products/product-service";
import { demoProducts } from "@/lib/products/demo-products";
import { SupabaseChatRepository } from "@/lib/storage/chat-repository";
import { classifyComment } from "@/lib/facebook/comment-automation";
import { addMessage, getOrCreateConversation, listFacebookPages, saveWebhookEvent, store, upsertFacebookPage } from "@/lib/storage/local-store";
import { createCampaign, previewRecipients, setCampaignStatus } from "@/lib/campaigns/campaign-service";
import type { CommentHideMode, Conversation, ConversationState, FacebookPage, Message } from "@/lib/types";

delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const conversation: Conversation = {
  id: "conv_test",
  platform: "local",
  external_user_id: "test",
  status: "OPEN",
  ai_enabled: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function send(state: ConversationState, history: Message[], customerMessage: string) {
  const output = await runSalesEngine({
    conversation,
    history,
    state,
    products: demoProducts,
    customerMessage
  });
  const nextState = mergeState(state, output);
  const nextHistory = [
    ...history,
    {
      id: `msg_${history.length}_customer`,
      conversation_id: conversation.id,
      sender_type: "customer" as const,
      message: customerMessage,
      created_at: new Date().toISOString()
    },
    {
      id: `msg_${history.length}_ai`,
      conversation_id: conversation.id,
      sender_type: "ai" as const,
      message: output.reply,
      created_at: new Date().toISOString()
    }
  ];
  return { output, state: nextState, history: nextHistory };
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private limitCount: number | null = null;
  private orderColumn: string | null = null;
  private orderAscending = true;
  private selectRequested = false;

  constructor(
    private readonly db: Record<string, any[]>,
    private readonly table: string,
    private readonly op: "select" | "insert" | "update" | "delete" | "upsert" = "select",
    private readonly payload?: any
  ) {}

  select() {
    this.selectRequested = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    return { ...result, data: result.data?.[0] ?? null };
  }

  async single() {
    const result = await this.execute();
    return { ...result, data: result.data?.[0] ?? null };
  }

  then(resolve: (value: { data: any[] | null; error: null }) => void, reject: (reason: unknown) => void) {
    this.execute().then(resolve, reject);
  }

  private async execute() {
    this.db[this.table] ??= [];
    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: row.id ?? `${this.table}_${this.db[this.table].length + 1}`,
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
        ...row
      }));
      this.db[this.table].push(...rows);
      return { data: this.selectRequested ? rows : null, error: null };
    }
    if (this.op === "upsert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => {
        const index = this.db[this.table].findIndex((item) => item.id === row.id || item.conversation_id === row.conversation_id);
        const next = { ...this.db[this.table][index], ...row };
        if (index >= 0) this.db[this.table][index] = next;
        else this.db[this.table].push({ id: row.id ?? `${this.table}_${this.db[this.table].length + 1}`, created_at: new Date().toISOString(), ...next });
        return index >= 0 ? next : this.db[this.table][this.db[this.table].length - 1];
      });
      return { data: this.selectRequested ? rows : null, error: null };
    }
    if (this.op === "update") {
      const rows = this.matchRows().map((row) => Object.assign(row, this.payload));
      return { data: this.selectRequested ? rows : null, error: null };
    }
    if (this.op === "delete") {
      const rows = this.matchRows();
      this.db[this.table] = this.db[this.table].filter((row) => !rows.includes(row));
      return { data: null, error: null };
    }

    let rows = this.matchRows();
    if (this.orderColumn) {
      rows = [...rows].sort((a, b) => {
        const result = String(a[this.orderColumn as string] ?? "").localeCompare(String(b[this.orderColumn as string] ?? ""));
        return this.orderAscending ? result : -result;
      });
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return { data: rows, error: null };
  }

  private matchRows() {
    return (this.db[this.table] ?? []).filter((row) => this.filters.every(([column, value]) => row[column] === value));
  }
}

function fakeSupabase(db: Record<string, any[]>) {
  return {
    from(table: string) {
      return {
        select: () => new FakeQuery(db, table).select(),
        insert: (payload: any) => new FakeQuery(db, table, "insert", payload),
        update: (payload: any) => new FakeQuery(db, table, "update", payload),
        delete: () => new FakeQuery(db, table, "delete"),
        upsert: (payload: any) => new FakeQuery(db, table, "upsert", payload)
      };
    }
  };
}

async function main() {
  assert.equal(detectIntent("Cho toi xin bao gia son noi that"), "quotation_request");
  assert.equal(detectIntent("SDT toi 090 123 4567"), "phone_provided");
  assert.equal(detectIntent("Cho anh gap nhan vien"), "human_request");
  assert.equal(detectIntent("Anh muon mua luon"), "purchase_intent");

  for (const raw of ["0901234567", "090 123 4567", "090-123-4567", "+84901234567"]) {
    const phone = detectVietnamesePhone(raw);
    assert.equal(phone.valid, true);
    assert.equal(phone.normalized, "0901234567");
  }
  assert.equal(detectVietnamesePhone("0123456789").valid, false);

  const settings = store.automationSettings;
  const phoneComment = classifyComment({ page: null, message: "Gia sao shop 0901234567", isFromPage: false, settings });
  assert.equal(phoneComment.shouldHide, true);
  assert.equal(phoneComment.shouldLike, true);
  assert.equal(phoneComment.shouldReply, true);

  const commentPage = (mode: CommentHideMode, patch: Partial<FacebookPage> = {}): FacebookPage => ({
    id: `page_${mode}`,
    page_id: `page_${mode}`,
    page_name: `Page ${mode}`,
    page_access_token: null,
    token_mask: null,
    connected: true,
    webhook_status: "active",
    granted_permissions: [],
    missing_permissions: [],
    automation_enabled: true,
    auto_reply_messenger: true,
    ai_sales_mode: true,
    auto_handoff: true,
    auto_like_comments: true,
    auto_reply_comments: true,
    auto_hide_comments: true,
    comment_hide_mode: mode,
    hide_phone_comments: true,
    hide_keyword_comments: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch
  });

  assert.equal(classifyComment({ page: commentPage("hide_all"), message: "Gia sao shop", isFromPage: false, settings }).shouldHide, true);
  assert.equal(classifyComment({ page: commentPage("phone_only"), message: "Gia sao shop", isFromPage: false, settings }).shouldHide, false);
  assert.equal(classifyComment({ page: commentPage("phone_only"), message: "Gia sao shop 0901234567", isFromPage: false, settings }).shouldHide, true);
  assert.equal(classifyComment({ page: commentPage("blocked_keywords"), message: "phone giup anh", isFromPage: false, settings }).shouldHide, true);
  assert.equal(classifyComment({ page: commentPage("blocked_keywords"), message: "Gia sao shop", isFromPage: false, settings }).shouldHide, false);
  assert.equal(classifyComment({ page: commentPage("off"), message: "Gia sao shop 0901234567", isFromPage: false, settings }).shouldHide, false);
  assert.equal(classifyComment({ page: commentPage("hide_all", { auto_hide_comments: false }), message: "Gia sao shop", isFromPage: false, settings }).shouldHide, false);

  store.facebookPages = [];
  upsertFacebookPage({ page_id: "page_a", page_name: "Page A", comment_hide_mode: "hide_all", hide_phone_comments: false });
  upsertFacebookPage({ page_id: "page_b", page_name: "Page B", comment_hide_mode: "phone_only" });
  const savedPages = listFacebookPages();
  assert.equal(savedPages.find((page) => page.page_id === "page_a")?.comment_hide_mode, "hide_all");
  assert.equal(savedPages.find((page) => page.page_id === "page_b")?.comment_hide_mode, "phone_only");

  const pageComment = classifyComment({ page: null, message: "Page tra loi", isFromPage: true, settings });
  assert.equal(pageComment.shouldHide, false);
  assert.equal(pageComment.shouldReply, false);

  assert.equal(saveWebhookEvent({ event_key: "evt_1", event_type: "message", page_id: "p1", payload: {}, processed: false }).duplicate, false);
  assert.equal(saveWebhookEvent({ event_key: "evt_1", event_type: "message", page_id: "p1", payload: {}, processed: false }).duplicate, true);

  const normalizedIncoming = normalizeWebhookBody({
    object: "page",
    entry: [{ id: "page_webhook", time: Date.now(), messaging: [{ sender: { id: "customer_1" }, recipient: { id: "page_webhook" }, timestamp: Date.now(), message: { mid: "mid_1", text: "Xin tu van" } }] }]
  });
  assert.equal(normalizedIncoming[0]?.pageId, "page_webhook");
  assert.equal(normalizedIncoming[0]?.senderId, "customer_1");
  assert.equal(normalizedIncoming[0]?.type === "message" ? normalizedIncoming[0].shouldTriggerAI : false, true);

  const normalizedEcho = normalizeWebhookBody({
    object: "page",
    entry: [{ id: "page_webhook", time: Date.now(), messaging: [{ sender: { id: "page_webhook" }, recipient: { id: "customer_1" }, timestamp: Date.now(), message: { mid: "mid_echo", text: "Da gui", is_echo: true } }] }]
  });
  assert.equal(normalizedEcho[0]?.type === "message" ? normalizedEcho[0].senderId : null, "customer_1");
  assert.equal(normalizedEcho[0]?.type === "message" ? normalizedEcho[0].shouldTriggerAI : true, false);

  store.conversations = [];
  store.messages = [];
  store.states = [];
  store.webhookEvents = [];
  upsertFacebookPage({ page_id: "page_webhook", page_name: "Webhook Page", connected: true, page_access_token: null });
  const webhookResponse = await postWebhook(
    new Request("http://localhost/api/facebook/webhook", {
      method: "POST",
      body: JSON.stringify({
        object: "page",
        entry: [{ id: "page_webhook", time: Date.now(), messaging: [{ sender: { id: "customer_2" }, recipient: { id: "page_webhook" }, timestamp: Date.now(), message: { mid: "mid_2", text: "Can bao gia" } }] }]
      })
    })
  );
  assert.equal(webhookResponse.status, 200);
  assert.equal(store.conversations[0]?.page_id, "page_webhook");
  assert.equal(store.conversations[0]?.customer_psid, "customer_2");
  assert.equal(store.messages.filter((message) => message.facebook_message_id === "mid_2").length, 1);
  await postWebhook(
    new Request("http://localhost/api/facebook/webhook", {
      method: "POST",
      body: JSON.stringify({
        object: "page",
        entry: [{ id: "page_webhook", time: Date.now(), messaging: [{ sender: { id: "customer_2" }, recipient: { id: "page_webhook" }, timestamp: Date.now(), message: { mid: "mid_2", text: "Can bao gia" } }] }]
      })
    })
  );
  assert.equal(store.messages.filter((message) => message.facebook_message_id === "mid_2").length, 1);
  assert.equal(store.webhookEvents.filter((event) => event.event_key === "msg:page_webhook:mid_2").length, 1);

  const baseState = initialState("conv_score");
  const firstScore = scoreLead("quotation_request", baseState, "nha 120m2 can bao gia tuan nay");
  const scoredState = { ...baseState, lead_score: firstScore, scored_signals: ["quotation_request", "area", "urgent_timing"] };
  const secondScore = scoreLead("quotation_request", scoredState, "bao gia lai giup anh");
  assert.equal(secondScore, firstScore);

  const interiorMatches = recommendProducts("Nha anh muon son lai phong khach", demoProducts, "interior_paint");
  assert.ok(interiorMatches.some((product) => product.interior_or_exterior === "interior"));
  assert.ok(interiorMatches.every((product) => product.active));
  assert.equal(recommendProducts("can mua ke bep inox", demoProducts, "unknown").length, 0);

  const estimate = estimatePaintQuantity({ area: 100, coats: 2, coverage: 10 });
  assert.equal(estimate.label, "ESTIMATE");
  assert.equal(estimate.required_liters, 20);
  assert.deepEqual(estimatePaintQuantity({ area: 100, coats: 2 }).missing, ["coverage"]);

  const fallback = new LocalFallbackProvider((input) => ({
    reply: `fallback: ${input.customerMessage}`,
    intent: "unknown",
    lead_score: 0,
    qualification_stage: "discovery",
    should_request_phone: false,
    should_handoff: false,
    recommendations: [],
    extracted: {},
    extracted_customer_data: {}
  }));
  assert.equal((await fallback.generate({ conversation, history: [], state: initialState("conv_fallback"), products: [], customerMessage: "hello" }))?.reply, "fallback: hello");

  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  const openai = new OpenAIProvider(
    () =>
      ({
        chat: {
          completions: {
            create: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      reply: "Da em tu van san pham phu hop trong KB.",
                      intent: "quotation_request",
                      lead_score: 75,
                      qualification_stage: "phone_capture",
                      should_request_phone: true,
                      should_handoff: false,
                      recommendations: ["[DEMO] Demo Interior Plus"],
                      extracted_customer_data: { area: 100, floors: 2, project_type: "renovation", interior_exterior: "both" }
                    })
                  }
                }
              ]
            })
          }
        }
      }) as any
  );
  const openaiOutput = await openai.generate({ conversation, history: [], state: initialState("conv_openai"), products: demoProducts, retrievedProducts: [demoProducts[0]], customerMessage: "bao gia" });
  assert.equal(openaiOutput?.qualification_stage, "phone_capture");
  assert.equal(openaiOutput?.extracted.area, "100");
  assert.equal(openaiOutput?.extracted_customer_data?.project_type, "renovation");

  const failingOpenAI = new OpenAIProvider(() => {
    throw new Error("network");
  });
  assert.equal(await failingOpenAI.generate({ conversation, history: [], state: initialState("conv_openai_fail"), products: [], customerMessage: "hi" }), null);
  delete process.env.OPENAI_API_KEY;

  let state = initialState("conv_a");
  let history: Message[] = [];

  for (const message of ["Chao em", "Anh dang xay nha", "Nha 2 tang", "Khoang 120m2", "Muon son ca trong ngoai", "Loai nao tot?"]) {
    const result = await send(state, history, message);
    state = result.state;
    history = result.history;
  }

  assert.equal(state.collected_project_type, "Nha xay moi");
  assert.equal(state.collected_floors, "2 tang");
  assert.equal(state.collected_area, "120m2");
  assert.equal(state.collected_product_interest, "Son noi that va ngoai that");

  const priceResult = await send(state, history, "Gia bao nhieu?");
  assert.ok(priceResult.output.reply.includes("120m2"));
  assert.ok(priceResult.output.reply.includes("không muốn báo sai"));
  assert.ok(!/bao nhieu m2|may tang/i.test(priceResult.output.reply));
  assert.equal(priceResult.output.should_request_phone, true);

  const browsingOnly = await send(initialState("conv_b"), [], "Anh chi dang tham khao thoi");
  assert.equal(browsingOnly.output.should_request_phone, false);
  assert.ok(!browsingOnly.output.reply.includes("SDT"));

  const buyResult = await send(state, history, "Anh muon mua luon");
  assert.ok(buyResult.output.lead_score >= state.lead_score);
  assert.equal(buyResult.output.should_request_phone, true);

  const phoneResult = await send(buyResult.state, buyResult.history, "0987654321");
  assert.equal(phoneResult.state.collected_phone, "0987654321");
  assert.equal(phoneResult.state.qualification_stage, "ready_for_quote");
  assert.equal(phoneResult.output.should_request_phone, false);
  assert.equal(phoneResult.output.next_action, "ask_address");

  const handoff = await send(initialState("conv_e"), [], "Cho anh gap nhan vien");
  assert.equal(handoff.output.should_handoff, true);
  assert.equal(handoff.state.qualification_stage, "handoff");

  const apiId = `api_${Date.now()}`;
  const apiHandoff = await postChat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Cho anh gap nhan vien", externalUserId: apiId })
    })
  );
  const handoffJson = await apiHandoff.json();
  assert.equal(handoffJson.state.should_handoff, true);
  assert.equal(handoffJson.conversation.status, "HUMAN");
  assert.equal(handoffJson.lead.source, "local_chat");

  const apiAfterHandoff = await postChat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Tin sau handoff", externalUserId: apiId })
    })
  );
  const afterJson = await apiAfterHandoff.json();
  assert.equal(afterJson.reply, null);
  assert.equal(afterJson.conversation.status, "HUMAN");

  const db: Record<string, any[]> = {};
  const repository = new SupabaseChatRepository(fakeSupabase(db) as any);
  const dbConversation = await repository.getOrCreateConversation("db_user", "local");
  await repository.addMessage(dbConversation.id, "customer", "Nha 100m2 can bao gia");
  assert.equal((await repository.getMessages(dbConversation.id)).length, 1);
  const dbOutput = await runSalesEngine({
    conversation: dbConversation,
    history: await repository.getMessages(dbConversation.id),
    state: await repository.getState(dbConversation.id),
    products: demoProducts,
    customerMessage: "Nha 100m2 can bao gia"
  });
  await repository.addMessage(dbConversation.id, "ai", dbOutput.reply);
  await repository.updateState(dbConversation.id, dbOutput);
  const dbPhoneOutput = await runSalesEngine({
    conversation: dbConversation,
    history: await repository.getMessages(dbConversation.id),
    state: await repository.getState(dbConversation.id),
    products: demoProducts,
    customerMessage: "0987654321"
  });
  await repository.updateState(dbConversation.id, dbPhoneOutput);
  const dbLead = await repository.upsertLeadFromState(dbConversation.id, dbPhoneOutput);
  assert.equal(dbLead.normalized_phone, "0987654321");
  assert.equal(dbLead.status, "QUALIFIED");
  assert.equal(db.lead_events.length, 1);
  assert.equal((await repository.listConversations())[0].messages.length, 2);

  const pageAConversation = await repository.getOrCreateConversation("psid_same", "facebook", "page_a");
  const pageBConversation = await repository.getOrCreateConversation("psid_same", "facebook", "page_b");
  assert.notEqual(pageAConversation.id, pageBConversation.id);
  await repository.addMessage(pageAConversation.id, "customer", "page a msg", { pageId: "page_a", facebook_message_id: "fb_mid_1", createdTime: new Date().toISOString() });
  await repository.addMessage(pageAConversation.id, "customer", "duplicate page a msg", { pageId: "page_a", facebook_message_id: "fb_mid_1", createdTime: new Date().toISOString() });
  assert.equal((await repository.getMessages(pageAConversation.id)).filter((message) => message.facebook_message_id === "fb_mid_1").length, 1);

  store.conversations = [];
  store.messages = [];
  store.states = [];
  store.leads = [];
  const campaignConversation = store.conversations.find(() => false) ?? null;
  assert.equal(campaignConversation, null);
  const localPageConversation = getOrCreateConversation("camp_psid", "facebook", "camp_page");
  addMessage(localPageConversation.id, "customer", "Can bao gia", {
    pageId: "camp_page",
    createdTime: new Date().toISOString()
  });
  upsertFacebookPage({ page_id: "camp_page", page_name: "Campaign Page", page_access_token: "token", connected: true });
  const missingPhonePreview = await previewRecipients({ pageIds: ["camp_page"], missingPhone: true });
  assert.equal(missingPhonePreview.length, 1);
  assert.equal(missingPhonePreview[0].eligibility, "eligible");
  const campaignResult = await createCampaign({
    name: "Test campaign",
    segment: { pageIds: ["camp_page"], missingPhone: true },
    messageTemplate: "Chao {{name}} {{phone}}",
    recipientIds: [missingPhonePreview[0].id, missingPhonePreview[0].id]
  });
  assert.equal(campaignResult.recipients.length, 1);
  assert.ok(!campaignResult.recipients[0].message_text?.includes("{{"));
  const stoppedCampaign = await setCampaignStatus(campaignResult.campaign.id, "stopped");
  assert.equal(stoppedCampaign?.status, "stopped");

  console.log("sales-engine tests passed");
}

void main();
