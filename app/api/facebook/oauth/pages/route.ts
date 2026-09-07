import { NextResponse } from "next/server";
import { listFacebookPages, upsertFacebookPage } from "@/lib/admin-data";
import { consumeOAuthPages, getOAuthSession, graphUrl, inspectPageToken, safeErrorMessage } from "@/lib/facebook/oauth";

export const dynamic = "force-dynamic";

const REQUIRED_MESSENGER_PERMISSIONS = ["pages_show_list", "pages_manage_metadata", "pages_messaging"] as const;

type ConnectResult = {
  page_id: string;
  page_name: string;
  status: "success" | "failed";
  stage: "permission" | "page_token" | "inspect_token" | "supabase" | "subscribe_webhook" | "connected";
  reason: string;
  missing_permissions: string[];
};

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session");
  const session = await getOAuthSession(sessionId);
  if (!session) return NextResponse.json({ pages: [] });

  return NextResponse.json({
    warnings: session.warnings ?? [],
    pages: session.pages.map((page) => ({
      id: page.id,
      name: page.name,
      avatar_url: page.picture?.data?.url ?? null,
      has_token: Boolean(page.access_token),
      token_status: page.access_token ? "ready" : page.token_status ?? "business_permission_no_page_token"
    }))
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; pageIds?: string[] };
  const sessionId = body.sessionId ?? "";
  const session = await getOAuthSession(sessionId);
  const requested = new Set(Array.isArray(body.pageIds) ? body.pageIds.map(String) : []);
  const selected = session?.pages.filter((page) => requested.has(page.id)) ?? [];

  if (!selected.length) {
    return NextResponse.json({ error: "Không có Page hợp lệ để kết nối", results: [] }, { status: 400 });
  }

  const grantedPermissions = (session?.userPermissions ?? [])
    .filter((item) => item.status === "granted")
    .map((item) => item.permission);
  const hasPermissionSnapshot = Boolean(session?.userPermissions?.length);
  const missingPermissions = hasPermissionSnapshot
    ? REQUIRED_MESSENGER_PERMISSIONS.filter((permission) => !grantedPermissions.includes(permission))
    : [];

  const connected = [];
  const rejected: ConnectResult[] = [];
  const results: ConnectResult[] = [];
  const connectedPageIds: string[] = [];

  for (const page of selected) {
    if (missingPermissions.length) {
      const result = failed(
        page.id,
        page.name,
        "permission",
        `Facebook chưa cấp đủ quyền Messenger: ${missingPermissions.join(", ")}`,
        [...missingPermissions]
      );
      rejected.push(result);
      results.push(result);
      continue;
    }

    const token = page.access_token;
    if (!token) {
      const result = failed(page.id, page.name, "page_token", "Không lấy được Page Access Token.", ["page_access_token"]);
      rejected.push(result);
      results.push(result);
      continue;
    }

    let pageName = page.name;
    let avatar = page.picture?.data?.url ?? null;
    try {
      const inspection = await inspectPageToken(page.id, token);
      if (!inspection.ok) {
        const result = failed(page.id, page.name, "inspect_token", "Page Access Token không hợp lệ hoặc không đúng Page.", ["invalid_page_token"]);
        rejected.push(result);
        results.push(result);
        continue;
      }
      pageName = inspection.profile.name ?? pageName;
      avatar = inspection.profile.picture?.data?.url ?? avatar;
    } catch (error) {
      const result = failed(page.id, page.name, "inspect_token", safeErrorMessage(error), ["invalid_page_token"]);
      rejected.push(result);
      results.push(result);
      continue;
    }

    try {
      await upsertFacebookPage(
        {
          page_id: page.id,
          page_name: pageName,
          page_avatar_url: avatar,
          page_access_token: token,
          connected: false,
          webhook_status: "unknown",
          granted_permissions: grantedPermissions,
          missing_permissions: [],
          automation_enabled: true,
          auto_reply_messenger: true,
          ai_sales_mode: true,
          auto_handoff: false,
          auto_like_comments: false,
          auto_reply_comments: false,
          auto_hide_comments: false,
          hide_phone_comments: false,
          hide_keyword_comments: false,
          ai_provider: "gemini",
          ai_model: "gemini-3.8-flash",
          ai_provider_fallback_enabled: false,
          ai_reply_delay_seconds: 1
        },
        { throwOnSupabaseError: true }
      );
    } catch (error) {
      const result = failed(page.id, page.name, "supabase", safeErrorMessage(error), []);
      rejected.push(result);
      results.push(result);
      continue;
    }

    try {
      await subscribeMessengerWebhook(page.id, token);
    } catch (error) {
      await upsertFacebookPage({
        page_id: page.id,
        page_name: pageName,
        connected: false,
        webhook_status: "error"
      });
      const result = failed(page.id, page.name, "subscribe_webhook", safeErrorMessage(error), []);
      rejected.push(result);
      results.push(result);
      continue;
    }

    try {
      const row = await upsertFacebookPage(
        {
          page_id: page.id,
          page_name: pageName,
          page_avatar_url: avatar,
          page_access_token: token,
          connected: true,
          webhook_status: "active",
          granted_permissions: grantedPermissions,
          missing_permissions: [],
          automation_enabled: true,
          auto_reply_messenger: true,
          ai_sales_mode: true,
          auto_handoff: false,
          auto_like_comments: false,
          auto_reply_comments: false,
          auto_hide_comments: false,
          hide_phone_comments: false,
          hide_keyword_comments: false,
          ai_provider: "gemini",
          ai_model: "gemini-3.8-flash",
          ai_provider_fallback_enabled: false,
          ai_reply_delay_seconds: 1
        },
        { throwOnSupabaseError: true }
      );
      connected.push(row);
      connectedPageIds.push(page.id);
      results.push({
        page_id: page.id,
        page_name: pageName,
        status: "success",
        stage: "connected",
        reason: "Kết nối Messenger thành công",
        missing_permissions: []
      });
    } catch (error) {
      const result = failed(page.id, page.name, "supabase", safeErrorMessage(error), []);
      rejected.push(result);
      results.push(result);
    }
  }

  if (connectedPageIds.length) await consumeOAuthPages(sessionId, connectedPageIds);

  const payload = {
    pages: await listFacebookPages(),
    connected,
    rejected,
    results
  };

  return connected.length
    ? NextResponse.json(payload)
    : NextResponse.json({ ...payload, error: "Không Page nào kết nối Messenger thành công." }, { status: 400 });
}

async function subscribeMessengerWebhook(pageId: string, pageAccessToken: string) {
  const url = graphUrl(`${pageId}/subscribed_apps`, pageAccessToken, {
    subscribed_fields: "messages,messaging_postbacks"
  });
  const response = await fetch(url, { method: "POST" });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok || payload.success === false) {
    const code = payload.error?.code ? ` (${payload.error.code}${payload.error.error_subcode ? `/${payload.error.error_subcode}` : ""})` : "";
    throw new Error(`Không đăng ký được webhook Messenger${code}: ${payload.error?.message ?? `HTTP ${response.status}`}`);
  }
  return payload;
}

function failed(
  pageId: string,
  pageName: string,
  stage: ConnectResult["stage"],
  reason: string,
  missingPermissions: string[]
): ConnectResult {
  return {
    page_id: pageId,
    page_name: pageName,
    status: "failed",
    stage,
    reason,
    missing_permissions: missingPermissions
  };
}
