import { getFacebookPage, listFacebookPages } from "@/lib/admin-data";
import { FacebookGraphClient } from "@/lib/facebook/graph-api";
import { createChatRepository } from "@/lib/storage/chat-repository";
import type { FacebookPage } from "@/lib/types";

export interface ConversationSyncResult {
  ok: boolean;
  page_id?: string;
  next_cursor?: string | null;
  has_more?: boolean;
  limit: number;
  scanned_conversations: number;
  found_conversations: number;
  imported_conversations: number;
  updated_conversations: number;
  imported_messages: number;
  duplicate_messages: number;
  errors: string[];
}

export async function syncMessengerConversations(options: { pageId?: string | null; cursor?: string | null; limit?: number } = {}): Promise<ConversationSyncResult> {
  const pageId = options.pageId ?? null;
  const pages = pageId ? [await getRawPage(pageId)] : await getRawPages();
  const batchLimit = Math.min(50, Math.max(5, options.limit ?? envNumber("SYNC_CONVERSATION_BATCH_SIZE", 30)));
  const result: ConversationSyncResult = {
    ok: true,
    page_id: pageId ?? undefined,
    next_cursor: null,
    has_more: false,
    limit: batchLimit,
    scanned_conversations: 0,
    found_conversations: 0,
    imported_conversations: 0,
    updated_conversations: 0,
    imported_messages: 0,
    duplicate_messages: 0,
    errors: []
  };
  const repository = createChatRepository();
  const conversationPageLimit = envNumber("SYNC_MAX_CONVERSATIONS_PER_PAGE", 100);
  const maxConversationPages = envNumber("SYNC_MAX_CONVERSATION_PAGES", 200);

  for (const page of pages.filter(Boolean) as FacebookPage[]) {
    if (!page.connected || !page.page_access_token) {
      result.errors.push(`Page ${page.page_id} has no active Page token`);
      continue;
    }
    const client = new FacebookGraphClient(page.page_access_token);
    let after: string | null | undefined = page.page_id === pageId ? options.cursor : null;
    let hasNext = false;
    let pageCount = 0;
    do {
      const remaining = Math.max(1, batchLimit - result.scanned_conversations);
      const conversations = await client.listConversations(Math.min(conversationPageLimit, remaining), after);
      hasNext = Boolean(conversations.paging?.cursors?.after || conversations.paging?.next);
      const fetchedCount = conversations.data?.length ?? 0;
      console.info("[facebook-sync] conversation page", {
        pageId: page.page_id,
        pageNumber: pageCount + 1,
        fetched: fetchedCount,
        nextCursor: hasNext,
        totalImported: result.imported_conversations + result.updated_conversations
      });
      for (const fbConversation of conversations.data ?? []) {
        result.scanned_conversations += 1;
        result.found_conversations += 1;
        try {
          const customer = findCustomerParticipant(page, fbConversation);
          if (!customer.id) {
            result.errors.push(`Cannot identify customer PSID for conversation ${fbConversation.id}`);
            continue;
          }
          const conversation = await repository.getOrCreateConversation(customer.id, "facebook", page.page_id);
          const wasNew = !conversation.last_message_at && !conversation.last_message;
          await repository.updateConversation(conversation.id, {
            customer_name: customer.name ?? conversation.customer_name ?? null,
            customer_psid: customer.id,
            customer_avatar_url: customer.avatar ?? conversation.customer_avatar_url ?? null,
            page_id: page.page_id,
            last_message_at: fbConversation.updated_time ?? conversation.last_message_at ?? null,
            updated_at: fbConversation.updated_time ?? conversation.updated_at
          });
          await repository.updateCustomerProfile(conversation.id, {
            name: customer.name,
            avatar: customer.avatar,
            pageId: page.page_id,
            psid: customer.id
          });
          if (wasNew) result.imported_conversations += 1;
          else result.updated_conversations += 1;
          const messageResult = await importMessages(client, repository, page, conversation.id, customer.id, fbConversation.id);
          result.imported_messages += messageResult.imported;
          result.duplicate_messages += messageResult.duplicates;
        } catch (error) {
          result.errors.push(`Conversation ${fbConversation.id}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      }
      after = conversations.paging?.cursors?.after;
      pageCount += 1;
      if (pageId && result.scanned_conversations >= batchLimit && hasNext && after) {
        result.has_more = true;
        result.next_cursor = after;
        result.ok = result.errors.length === 0;
        return result;
      }
    } while (hasNext && after && pageCount < maxConversationPages);
  }

  result.ok = result.errors.length === 0;
  return result;
}

async function importMessages(
  client: FacebookGraphClient,
  repository: ReturnType<typeof createChatRepository>,
  page: FacebookPage,
  conversationId: string,
  customerPsid: string,
  facebookConversationId: string
) {
  const result = { imported: 0, duplicates: 0 };
  let after: string | null | undefined = null;
  let pageCount = 0;
  const messagePageLimit = envNumber("SYNC_MAX_MESSAGES_PAGE_SIZE", 100);
  const maxMessagePages = envNumber("SYNC_MAX_MESSAGES_PER_CONVERSATION", 500);
  let hasNext = false;
  do {
    const messages = await client.listConversationMessages(facebookConversationId, messagePageLimit, after);
    hasNext = Boolean(messages.paging?.cursors?.after || messages.paging?.next);
    for (const message of [...(messages.data ?? [])].reverse()) {
      if (!message.message?.trim()) continue;
      if (await repository.getMessageByFacebookId(message.id)) {
        result.duplicates += 1;
        continue;
      }
      const senderType = isPageSender(page, message.from?.id) ? "staff" : "customer";
      await repository.addMessage(conversationId, senderType, message.message, {
        pageId: page.page_id,
        customerPsid,
        facebook_message_id: message.id,
        createdTime: message.created_time,
        source: "historical_sync",
        facebook_direction: senderType === "customer" ? "incoming" : "outgoing"
      });
      result.imported += 1;
    }
    after = messages.paging?.cursors?.after;
    pageCount += 1;
  } while (hasNext && after && pageCount < maxMessagePages);
  return result;
}

function findCustomerParticipant(page: FacebookPage, conversation: { participants?: { data?: Participant[] }; senders?: { data?: Participant[] } }) {
  const participants = [...(conversation.participants?.data ?? []), ...(conversation.senders?.data ?? [])];
  const seen = new Set<string>();
  const customer = participants.find((participant) => {
    if (!participant.id || seen.has(participant.id)) return false;
    seen.add(participant.id);
    if (isPageSender(page, participant.id)) return false;
    const name = participant.name?.toLowerCase() ?? "";
    if (isSystemParticipantName(name) || name === page.page_name.toLowerCase()) return false;
    return true;
  });
  return { id: customer?.id ?? null, name: customer?.name ?? null, avatar: customer?.picture?.data?.url ?? null };
}

type Participant = { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };

function isPageSender(page: FacebookPage, id?: string | null) {
  return Boolean(id && (id === page.page_id || id === page.id));
}

function isSystemParticipantName(name: string) {
  return ["meta business agent", "facebook user", "page inbox", "business manager"].some((systemName) => name.includes(systemName));
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function getRawPages() {
  const pages = await listFacebookPages();
  return Promise.all(pages.map((page) => getRawPage(page.page_id)));
}

async function getRawPage(pageId: string) {
  return getFacebookPage(pageId);
}
