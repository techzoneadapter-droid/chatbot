import type { FacebookPage } from "@/lib/types";
import { FacebookGraphApiError, graphUrl } from "@/lib/facebook/oauth";

export class FacebookGraphClient {
  constructor(private readonly pageAccessToken: string) {}

  async sendMessage(recipientId: string, text: string) {
    return this.request("me/messages", "POST", {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text }
    });
  }

  async replyComment(commentId: string, message: string) {
    return this.request(`${commentId}/comments`, "POST", { message });
  }

  async likeComment(commentId: string) {
    return this.request(`${commentId}/likes`, "POST", {});
  }

  async hideComment(commentId: string) {
    return this.request(commentId, "POST", { is_hidden: true });
  }

  async unhideComment(commentId: string) {
    return this.request(commentId, "POST", { is_hidden: false });
  }

  async getPageProfile() {
    return this.request("me", "GET", undefined, { fields: "id,name,picture{url}" });
  }

  async getMessengerProfile(psid: string) {
    return this.request(psid, "GET", undefined, { fields: "first_name,last_name,name,profile_pic" }) as Promise<{
      id?: string;
      first_name?: string;
      last_name?: string;
      name?: string;
      profile_pic?: string;
    }>;
  }

  async getPermissions() {
    return this.request("me/permissions", "GET");
  }

  async listConversations(limit = 25, after?: string | null) {
    const params: Record<string, string> = {
      fields: "id,updated_time,participants{id,name,email,picture},senders{id,name,email,picture},message_count,link",
      limit: String(limit)
    };
    if (after) params.after = after;
    return this.request("me/conversations", "GET", undefined, params) as Promise<{
      data?: Array<{ id: string; updated_time?: string; participants?: { data?: Array<{ id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } }> }; senders?: { data?: Array<{ id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } }> } }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>;
  }

  async listConversationMessages(conversationId: string, limit = 50, after?: string | null) {
    const params: Record<string, string> = {
      fields: "id,message,created_time,from,to",
      limit: String(limit)
    };
    if (after) params.after = after;
    return this.request(`${conversationId}/messages`, "GET", undefined, params) as Promise<{
      data?: Array<{ id: string; message?: string; created_time?: string; from?: { id?: string; name?: string }; to?: { data?: Array<{ id?: string; name?: string }> } }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>;
  }

  private async request(path: string, method: "GET" | "POST", body?: Record<string, unknown>, params: Record<string, string> = {}) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const url = graphUrl(path, this.pageAccessToken, params);
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;
        const graphError = graphErrorDetails(payload);
        lastError = new FacebookGraphApiError(graphError.message ?? `Meta Graph API ${response.status}`, {
          status: response.status,
          code: graphError.code,
          type: graphError.type,
          error_subcode: graphError.error_subcode
        });
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    throw lastError instanceof Error ? lastError : new Error("Meta Graph API request failed");
  }
}

export function clientForPage(page: Pick<FacebookPage, "page_access_token"> | null) {
  return page?.page_access_token ? new FacebookGraphClient(page.page_access_token) : null;
}

function maskGraphError(payload: unknown) {
  return JSON.parse(JSON.stringify(payload, (key, value) => (key.toLowerCase().includes("token") ? "[masked]" : value)));
}

function graphErrorDetails(payload: unknown) {
  const masked = maskGraphError(payload) as { error?: { code?: number; type?: string; message?: string; error_subcode?: number } };
  return {
    code: masked.error?.code,
    type: masked.error?.type,
    error_subcode: masked.error?.error_subcode,
    message: masked.error?.message
  };
}
