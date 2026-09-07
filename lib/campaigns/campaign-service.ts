import { listFacebookPages, getFacebookPage } from "@/lib/admin-data";
import { resolvePageAIConfigAsync } from "@/lib/ai/config";
import { createProvider } from "@/lib/ai/providers";
import { sendMessengerText } from "@/lib/facebook/messenger";
import { createChatRepository } from "@/lib/storage/chat-repository";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type {
  Campaign,
  CampaignPreviewRecipient,
  CampaignRecipient,
  CampaignSegment,
  CampaignStatus,
  MessengerEligibility
} from "@/lib/types";
import { nowIso } from "@/lib/utils/time";

const localCampaigns: Campaign[] = [];
const localRecipients: CampaignRecipient[] = [];

const templates = [
  { id: "tpl_phone", name: "Xin số điện thoại", body: "Dạ em chào {{name}}, anh/chị để lại SĐT để bên em tư vấn và báo giá chính xác hơn cho mình nhé.", created_at: nowIso(), updated_at: nowIso() },
  { id: "tpl_address", name: "Xin địa chỉ", body: "Dạ anh/chị cho em xin địa chỉ khu vực giao hàng để em kiểm tra phí ship và lịch giao phù hợp ạ.", created_at: nowIso(), updated_at: nowIso() },
  { id: "tpl_need", name: "Hỏi lại nhu cầu", body: "Dạ em muốn hỏi lại mình còn cần tư vấn về {{product}} không ạ? Em sẵn sàng hỗ trợ chọn dòng phù hợp.", created_at: nowIso(), updated_at: nowIso() },
  { id: "tpl_product", name: "Tư vấn sản phẩm", body: "Dạ với nhu cầu {{product}}, em có thể gợi ý dòng phù hợp và thông tin thi công cho mình ạ.", created_at: nowIso(), updated_at: nowIso() },
  { id: "tpl_care", name: "Chăm sóc khách cũ", body: "Dạ em chào {{name}}, bên {{page_name}} muốn hỏi thăm sản phẩm lần trước mình dùng có ổn không ạ?", created_at: nowIso(), updated_at: nowIso() },
  { id: "tpl_order", name: "Nhắc đơn hàng", body: "Dạ em chào {{name}}, mình còn muốn bên em hỗ trợ tiếp đơn hàng sơn không ạ?", created_at: nowIso(), updated_at: nowIso() },
  { id: "tpl_interest", name: "Hỏi còn quan tâm không", body: "Dạ em chào anh/chị, mình còn quan tâm đến nhu cầu sơn nhà không để em hỗ trợ tiếp nhé.", created_at: nowIso(), updated_at: nowIso() }
];

export async function listCampaigns() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return { campaigns: localCampaigns, recipients: localRecipients, templates };
  const [campaigns, recipients] = await Promise.all([
    supabase.from("campaigns").select("*").order("updated_at", { ascending: false }).limit(100),
    supabase.from("campaign_recipients").select("*").order("created_at", { ascending: false }).limit(500)
  ]);
  return {
    campaigns: (campaigns.data ?? []) as Campaign[],
    recipients: (recipients.data ?? []) as CampaignRecipient[],
    templates
  };
}

export async function previewRecipients(segment: CampaignSegment) {
  const repository = createChatRepository();
  const [rows, leads, pages] = await Promise.all([repository.listConversations(), repository.listLeads(), listFacebookPages()]);
  const pageMap = new Map(pages.map((page) => [page.page_id, page.page_name]));
  const leadMap = new Map(leads.map((lead) => [lead.conversation_id, lead]));
  return rows
    .filter((row) => row.platform === "facebook")
    .map((row): CampaignPreviewRecipient => {
      const lead = leadMap.get(row.id);
      const lastMessageAt = row.last_customer_message_at ?? row.last_message_at ?? row.updated_at ?? null;
      const eligibility = evaluateEligibility({ pageId: row.page_id ?? null, customerPsid: row.customer_psid ?? row.external_user_id ?? null, lastMessageAt });
      return {
        id: `${row.page_id ?? "none"}:${row.customer_psid ?? row.external_user_id}`,
        conversation_id: row.id,
        page_id: row.page_id ?? null,
        page_name: row.page_id ? pageMap.get(row.page_id) ?? row.page_id : null,
        customer_psid: row.customer_psid ?? row.external_user_id ?? null,
        customer_name: row.customer_name ?? row.state.collected_name ?? lead?.customer_name ?? null,
        phone: row.state.collected_phone ?? lead?.normalized_phone ?? null,
        address: row.state.collected_address ?? lead?.address ?? null,
        status: row.status,
        ai_enabled: row.ai_enabled,
        human_takeover: row.human_takeover ?? false,
        last_message_at: lastMessageAt,
        lead_created_at: lead?.created_at ?? null,
        product_interest: row.state.collected_product_interest ?? lead?.interested_products?.[0] ?? null,
        eligibility: eligibility.status,
        eligibility_reason: eligibility.reason,
        selected: eligibility.status === "eligible"
      };
    })
    .filter((recipient) => matchesSegment(recipient, segment));
}

export async function createCampaign(input: { name: string; segment: CampaignSegment; messageTemplate: string; recipientIds: string[]; personalize?: boolean }) {
  const preview = await previewRecipients(input.segment);
  const selected = preview.filter((recipient) => input.recipientIds.includes(recipient.id));
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    name: input.name.trim() || "Campaign",
    page_scope: input.segment.pageIds?.length ? input.segment.pageIds.join(",") : "all",
    segment_json: input.segment,
    message_template: input.messageTemplate,
    status: "draft",
    total_recipients: selected.length,
    eligible_count: selected.filter((recipient) => recipient.eligibility === "eligible").length,
    skipped_count: selected.filter((recipient) => recipient.eligibility !== "eligible").length,
    sent_count: 0,
    failed_count: 0,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  const recipients = await Promise.all(
    selected.map(async (recipient): Promise<CampaignRecipient> => ({
      id: crypto.randomUUID(),
      campaign_id: campaign.id,
      page_id: recipient.page_id,
      conversation_id: recipient.conversation_id,
      customer_psid: recipient.customer_psid,
      eligibility: recipient.eligibility,
      eligibility_reason: recipient.eligibility_reason,
      status: recipient.eligibility === "eligible" ? "pending" : "skipped",
      message_text: input.personalize ? await personalizeMessage(input.messageTemplate, recipient) : renderTemplate(input.messageTemplate, recipient),
      error: recipient.eligibility === "eligible" ? null : recipient.eligibility_reason,
      scheduled_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso()
    }))
  );
  return saveCampaign(campaign, recipients);
}

export async function setCampaignStatus(campaignId: string, status: CampaignStatus) {
  const supabase = createServiceSupabaseClient();
  const patch = { status, updated_at: nowIso(), completed_at: ["completed", "stopped"].includes(status) ? nowIso() : null };
  if (!supabase) {
    const campaign = localCampaigns.find((item) => item.id === campaignId);
    if (campaign) Object.assign(campaign, patch);
    return processCampaignQueue(campaignId);
  }
  await supabase.from("campaigns").update(patch).eq("id", campaignId);
  return processCampaignQueue(campaignId);
}

export async function processCampaignQueue(campaignId: string) {
  const supabase = createServiceSupabaseClient();
  const campaigns = supabase
    ? ((await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle()).data as Campaign | null)
    : localCampaigns.find((campaign) => campaign.id === campaignId) ?? null;
  if (!campaigns || campaigns.status === "paused" || campaigns.status === "stopped") return campaigns;
  if (campaigns.status === "draft") await updateCampaign(campaignId, { status: "running", started_at: nowIso() });

  const recipients = supabase
    ? ((await supabase.from("campaign_recipients").select("*").eq("campaign_id", campaignId).eq("status", "pending").limit(20)).data ?? []) as CampaignRecipient[]
    : localRecipients.filter((recipient) => recipient.campaign_id === campaignId && recipient.status === "pending").slice(0, 20);

  for (const recipient of recipients) {
    await sendRecipient(recipient);
  }
  await refreshCampaignStats(campaignId);
  return (await listCampaigns()).campaigns.find((campaign) => campaign.id === campaignId) ?? null;
}

export async function draftCampaignCopy(input: { goal?: string; segment: CampaignSegment; pageId?: string | null }) {
  const page = input.pageId ? await getFacebookPage(input.pageId) : null;
  const target = input.segment.missingPhone ? "xin SĐT" : input.segment.missingAddress ? "xin địa chỉ" : input.segment.inactiveDays ? "follow-up khách lâu chưa phản hồi" : "chăm sóc khách hàng";
  const fallback = `Dạ em chào {{name}}, bên {{page_name}} muốn ${target} để hỗ trợ mình tốt hơn về nhu cầu {{product}} ạ.`;
  const aiConfig = await resolvePageAIConfigAsync(page);
  try {
    const message =
      (await createProvider(aiConfig.provider).generateCampaignMessage({ goal: input.goal, segment: input.segment, pageContext: page, template: fallback }, aiConfig.model)) ??
      (aiConfig.fallbackEnabled && aiConfig.fallbackProvider ? await createProvider(aiConfig.fallbackProvider).generateCampaignMessage({ goal: input.goal, segment: input.segment, pageContext: page, template: fallback }) : null);
    return { message: message || fallback, provider: message ? aiConfig.provider : "local_fallback", model: aiConfig.model };
  } catch {
    return { message: fallback };
  }
}

function evaluateEligibility(input: { pageId: string | null; customerPsid: string | null; lastMessageAt: string | null }): { status: MessengerEligibility; reason: string } {
  if (!input.pageId) return { status: "not_eligible", reason: "missing_page_id" };
  if (!input.customerPsid) return { status: "not_eligible", reason: "missing_customer_psid" };
  if (!input.lastMessageAt) return { status: "unknown", reason: "missing_last_customer_message_at" };
  const hours = (Date.now() - new Date(input.lastMessageAt).getTime()) / 36e5;
  if (!Number.isFinite(hours)) return { status: "unknown", reason: "invalid_last_message_at" };
  return hours <= 24 ? { status: "eligible", reason: "customer_message_within_24h" } : { status: "not_eligible", reason: "outside_24h_messenger_window" };
}

function matchesSegment(recipient: CampaignPreviewRecipient, segment: CampaignSegment) {
  if (segment.pageIds?.length && (!recipient.page_id || !segment.pageIds.includes(recipient.page_id))) return false;
  if (segment.missingPhone && recipient.phone) return false;
  if (segment.hasPhone && !recipient.phone) return false;
  if (segment.missingAddress && recipient.address) return false;
  if (segment.hasAddress && !recipient.address) return false;
  if (segment.missingProductInterest && recipient.product_interest) return false;
  if (segment.hasProductInterest && !recipient.product_interest) return false;
  if (segment.potentialLead && recipient.status === "CLOSED") return false;
  if (segment.noResponse && !olderThanDays(recipient.last_message_at, segment.inactiveDays ?? 3)) return false;
  if (segment.aiHandling && (!recipient.ai_enabled || recipient.human_takeover)) return false;
  if (segment.humanHandling && !recipient.human_takeover) return false;
  if (segment.excludeHumanTakeover && recipient.human_takeover) return false;
  if (segment.lastMessageWithinDays && !withinDays(recipient.last_message_at, segment.lastMessageWithinDays)) return false;
  if (segment.leadCreatedWithinDays && !withinDays(recipient.lead_created_at, segment.leadCreatedWithinDays)) return false;
  if (segment.inactiveDays && !olderThanDays(recipient.last_message_at, segment.inactiveDays)) return false;
  return true;
}

function renderTemplate(template: string, recipient: CampaignPreviewRecipient) {
  return template.replace(/{{\s*(name|page_name|product|phone)\s*}}/g, (_match, key: string) => {
    const values: Record<string, string | null> = {
      name: recipient.customer_name,
      page_name: recipient.page_name,
      product: recipient.product_interest,
      phone: recipient.phone
    };
    return values[key] ?? "";
  }).replace(/\s{2,}/g, " ").trim();
}

async function personalizeMessage(template: string, recipient: CampaignPreviewRecipient) {
  return renderTemplate(template, recipient);
}

async function sendRecipient(recipient: CampaignRecipient) {
  await updateRecipient(recipient.id, { status: "sending", updated_at: nowIso() });
  if (recipient.eligibility !== "eligible") return updateRecipient(recipient.id, { status: "skipped", error: recipient.eligibility_reason ?? "not_eligible", updated_at: nowIso() });
  if (!recipient.page_id || !recipient.customer_psid || !recipient.message_text) return updateRecipient(recipient.id, { status: "skipped", error: "missing_recipient_data", updated_at: nowIso() });
  const page = await getFacebookPage(recipient.page_id);
  if (!page?.page_access_token) return updateRecipient(recipient.id, { status: "failed", error: "missing_page_token", updated_at: nowIso() });
  try {
    const result = (await sendMessengerText(recipient.customer_psid, recipient.message_text, page.page_access_token)) as { message_id?: string };
    await updateRecipient(recipient.id, { status: "sent", facebook_message_id: result.message_id ?? null, sent_at: nowIso(), updated_at: nowIso() });
    if (recipient.conversation_id) await createChatRepository().updateConversation(recipient.conversation_id, { last_campaign_at: nowIso() });
  } catch (error) {
    await updateRecipient(recipient.id, { status: "failed", error: error instanceof Error ? error.message : "send_failed", updated_at: nowIso() });
  }
}

async function saveCampaign(campaign: Campaign, recipients: CampaignRecipient[]) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    localCampaigns.unshift(campaign);
    localRecipients.unshift(...dedupeRecipients(recipients));
    return { campaign, recipients };
  }
  const savedCampaign = await supabase.from("campaigns").insert(campaign).select("*").single();
  const uniqueRecipients = dedupeRecipients(recipients);
  if (uniqueRecipients.length) await supabase.from("campaign_recipients").insert(uniqueRecipients);
  return { campaign: (savedCampaign.data as Campaign | null) ?? campaign, recipients: uniqueRecipients };
}

function dedupeRecipients(recipients: CampaignRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = `${recipient.campaign_id}:${recipient.page_id}:${recipient.customer_psid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function updateCampaign(campaignId: string, patch: Partial<Campaign>) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    const campaign = localCampaigns.find((item) => item.id === campaignId);
    if (campaign) Object.assign(campaign, patch);
    return;
  }
  await supabase.from("campaigns").update(patch).eq("id", campaignId);
}

async function updateRecipient(id: string, patch: Partial<CampaignRecipient>) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    const recipient = localRecipients.find((item) => item.id === id);
    if (recipient) Object.assign(recipient, patch);
    return;
  }
  await supabase.from("campaign_recipients").update(patch).eq("id", id);
}

async function refreshCampaignStats(campaignId: string) {
  const all = (await listCampaigns()).recipients.filter((recipient) => recipient.campaign_id === campaignId);
  const patch = {
    total_recipients: all.length,
    eligible_count: all.filter((recipient) => recipient.eligibility === "eligible").length,
    skipped_count: all.filter((recipient) => recipient.status === "skipped").length,
    sent_count: all.filter((recipient) => recipient.status === "sent").length,
    failed_count: all.filter((recipient) => recipient.status === "failed").length,
    status: all.length && all.every((recipient) => ["sent", "failed", "skipped"].includes(recipient.status)) ? "completed" : undefined,
    completed_at: all.length && all.every((recipient) => ["sent", "failed", "skipped"].includes(recipient.status)) ? nowIso() : undefined,
    updated_at: nowIso()
  };
  await updateCampaign(campaignId, patch as Partial<Campaign>);
}

function withinDays(value: string | null, days: number) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() <= days * 864e5;
}

function olderThanDays(value: string | null, days: number) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() >= days * 864e5;
}
