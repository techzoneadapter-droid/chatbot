import { NextResponse } from "next/server";
import { getFacebookPage, getFacebookWebhookDiagnostics, listFacebookPages } from "@/lib/admin-data";
import { appUrl, inspectPageToken } from "@/lib/facebook/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const [pages, events, endpointReachable] = await Promise.all([listFacebookPages(), getFacebookWebhookDiagnostics(), webhookEndpointReachable()]);
  const diagnostics = await Promise.all(
    pages.map(async (page) => {
      const rawPage = await getFacebookPage(page.page_id);
      const inspection = rawPage?.page_access_token ? await inspectPageToken(page.page_id, rawPage.page_access_token).catch(() => null) : null;
      const last = events.find((event) => event.page_id === page.page_id);
      const payload = (last?.payload && typeof last.payload === "object" ? last.payload : {}) as Record<string, unknown>;
      const normalized = payload.normalized && typeof payload.normalized === "object" ? (payload.normalized as Record<string, unknown>) : {};
      const rawMessage = payload.message && typeof payload.message === "object" ? (payload.message as Record<string, unknown>) : {};
      const messageId = normalized.message_id ?? rawMessage.mid ?? payload.message_id ?? null;
      const dbWriteAt = typeof payload.db_write_at === "string" ? payload.db_write_at : last?.created_at ?? null;
      const appSubscribed = Boolean(inspection?.subscribedFields.length);
      const messagesSubscribed = Boolean(inspection?.subscribedFields.includes("messages"));

      return {
        page_id: page.page_id,
        page_name: page.page_name,
        token_valid: Boolean(inspection?.ok),
        token_page_id_match: Boolean(inspection?.ok),
        webhook_endpoint_reachable: endpointReachable,
        app_subscribed: appSubscribed,
        subscribed_fields: inspection?.subscribedFields ?? [],
        messages_subscribed: messagesSubscribed,
        last_webhook_at: page.last_webhook_at ?? last?.created_at ?? null,
        last_webhook_event_type: last?.event_type ?? null,
        last_webhook_message_id: messageId,
        last_db_write_at: dbWriteAt,
        last_db_write_status: last ? (last.processed ? "success" : last.processing_error ? "failed" : "pending") : "none"
      };
    })
  );

  return NextResponse.json({ callback_url: `${appUrl()}/api/facebook/webhook`, diagnostics });
}

async function webhookEndpointReachable() {
  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || "paint-chatbot-dev-token";
  try {
    const response = await fetch(`${appUrl()}/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=ok`, { cache: "no-store" });
    return response.ok && (await response.text()) === "ok";
  } catch {
    return false;
  }
}
