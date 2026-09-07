import { FacebookGraphClient } from "@/lib/facebook/graph-api";

export async function sendMessengerText(recipientId: string, text: string, pageAccessToken?: string | null) {
  const token = pageAccessToken ?? process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.info("Messenger send skipped because page access token is not configured", { recipientId, textLength: text.length });
    return { ok: false, skipped: true, reason: "FACEBOOK_PAGE_ACCESS_TOKEN is not configured" };
  }
  return new FacebookGraphClient(token).sendMessage(recipientId, text);
}
