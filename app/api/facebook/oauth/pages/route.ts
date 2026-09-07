import { NextResponse } from "next/server";
import { listFacebookPages, upsertFacebookPage } from "@/lib/admin-data";
import {
  consumeOAuthPages,
  COMMENT_AUTOMATION_PERMISSIONS,
  FacebookGraphApiError,
  getOAuthSession,
  inspectPageToken,
  REQUIRED_PAGE_PERMISSIONS,
  safeErrorMessage,
  subscribePageToWebhook
} from "@/lib/facebook/oauth";

export const dynamic = "force-dynamic";

type ConnectResult = {
  page_id: string;
  page_name: string;
  status: "success" | "failed";
  stage: "page_token" | "inspect_token" | "supabase" | "subscribe_webhook" | "connected";
  reason: string;
  missing_permissions: string[];
  graph_error?: { status: number; code?: number; type?: string; message: string; error_subcode?: number };
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
      tasks: page.tasks ?? [],
      avatar_url: page.picture?.data?.url ?? null,
      source: page.source ?? "me_accounts",
      business_name: page.business_name ?? null,
      has_token: Boolean(page.access_token),
      token_status: page.access_token ? "ready" : page.token_status ?? "business_permission_no_page_token",
      connected: false
    }))
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string; pageIds?: string[] };
  const sessionId = body.sessionId ?? "";
  const requestedPageIds = Array.isArray(body.pageIds) ? body.pageIds.map(String) : [];
  const session = await getOAuthSession(sessionId);
  const wanted = new Set(requestedPageIds);
  const selected = session?.pages.filter((page) => wanted.has(page.id)) ?? [];
  const userPermissions = session?.userPermissions ?? [];
  const hasUserPermissionSnapshot = userPermissions.length > 0;
  const grantedUserPermissions = userPermissions.filter((item) => item.status === "granted").map((item) => item.permission);
  const missingRequiredPermissions = hasUserPermissionSnapshot ? REQUIRED_PAGE_PERMISSIONS.filter((permission) => !grantedUserPermissions.includes(permission)) : [];

  console.info("[facebook-oauth] connect session", { sessionId, tokenType: "USER", step: "read_saved_permissions" });
  console.info("[facebook-oauth] connect user permissions", {
    sessionId,
    tokenType: "USER",
    permissions: userPermissions.map((item) => `${item.permission}:${item.status}`)
  });

  if (selected.length === 0) {
    return NextResponse.json({ error: "Không có Page hợp lệ để kết nối", results: [] }, { status: 400 });
  }

  const saved = [];
  const rejected: ConnectResult[] = [];
  const results: ConnectResult[] = [];
  const connectedPageIds: string[] = [];

  for (const page of selected) {
    const token = page.access_token;
    if (!token) {
      const result = failedResult(page.id, page.name, "page_token", "Page access token is missing.", ["page_access_token"]);
      rejected.push(result);
      results.push(result);
      continue;
    }

    const granted = hasUserPermissionSnapshot ? grantedUserPermissions : [];
    const missing = missingRequiredPermissions;
    const missingCommentAutomation = COMMENT_AUTOMATION_PERMISSIONS.filter((permission) => !granted.includes(permission));
    const missingForPage = uniquePermissions([...missing, ...missingCommentAutomation]);

    console.info("[facebook-oauth] connect page step", { sessionId, pageId: page.id, tokenType: "PAGE", step: "inspect_page_token" });
    let inspectedName = page.name;
    let inspectedAvatar = page.picture?.data?.url ?? null;

    try {
      const inspection = await inspectPageToken(page.id, token);
      if (!inspection.ok) {
        const result = failedResult(page.id, page.name, "inspect_token", "Page token does not match this Page or cannot read Page profile.", ["invalid_page_token"]);
        rejected.push(result);
        results.push(result);
        continue;
      }
      inspectedName = inspection.profile?.name ?? inspectedName;
      inspectedAvatar = inspection.profile?.picture?.data?.url ?? inspectedAvatar;
    } catch (error) {
      console.error("[facebook-oauth] page token inspection failed", { pageId: page.id, message: safeErrorMessage(error) });
      const result = failedResult(page.id, page.name, "inspect_token", "Invalid Page token or cannot inspect Page.", ["invalid_page_token"]);
      rejected.push(result);
      results.push(result);
      continue;
    }

    try {
      console.info("[facebook-oauth] connect page step", { sessionId, pageId: page.id, tokenType: "PAGE", step: "save_page_token" });
      await upsertFacebookPage(
        {
          page_id: page.id,
          page_name: inspectedName,
          page_avatar_url: inspectedAvatar,
          page_access_token: token,
          connected: false,
          webhook_status: "unknown",
          granted_permissions: granted,
          missing_permissions: missingForPage
        },
        { throwOnSupabaseError: true }
      );
    } catch (error) {
      const result = failedResult(page.id, page.name, "supabase", safeErrorMessage(error), []);
      rejected.push(result);
      results.push(result);
      continue;
    }

    try {
      console.info("[facebook-oauth] connect page step", { sessionId, pageId: page.id, tokenType: "PAGE", step: "subscribe_webhook" });
      await subscribePageToWebhook(page.id, token);
    } catch (error) {
      await upsertFacebookPage({
        page_id: page.id,
        page_name: inspectedName,
        page_avatar_url: inspectedAvatar,
        page_access_token: token,
        connected: false,
        webhook_status: "error",
        granted_permissions: granted,
        missing_permissions: missingForPage
      });
      const result = failedResult(page.id, page.name, "subscribe_webhook", graphApiReason(error), []);
      if (error instanceof FacebookGraphApiError) {
        result.graph_error = {
          status: error.status,
          code: error.code,
          type: error.type,
          message: error.message,
          error_subcode: error.error_subcode
        };
      }
      rejected.push(result);
      results.push(result);
      continue;
    }

    try {
      const row = await upsertFacebookPage(
        {
          page_id: page.id,
          page_name: inspectedName,
          page_avatar_url: inspectedAvatar,
          page_access_token: token,
          connected: true,
          webhook_status: "active",
          granted_permissions: granted,
          missing_permissions: missingForPage
        },
        { throwOnSupabaseError: true }
      );
      saved.push(row);
      connectedPageIds.push(page.id);
      results.push({ page_id: page.id, page_name: page.name, status: "success", stage: "connected", reason: "Kết nối thành công", missing_permissions: [] });
    } catch (error) {
      const result = failedResult(page.id, page.name, "supabase", safeErrorMessage(error), []);
      rejected.push(result);
      results.push(result);
    }
  }

  if (connectedPageIds.length) await consumeOAuthPages(sessionId, connectedPageIds);
  if (saved.length === 0) {
    return NextResponse.json({ error: "No selected Page was fully connected.", connected: saved, rejected, results, pages: await listFacebookPages() }, { status: 400 });
  }

  return NextResponse.json({ pages: await listFacebookPages(), connected: saved, rejected, results }, { status: rejected.length ? 400 : 200 });
}

function failedResult(pageId: string, pageName: string, stage: ConnectResult["stage"], reason: string, missingPermissions: string[]): ConnectResult {
  return { page_id: pageId, page_name: pageName, status: "failed", stage, reason, missing_permissions: missingPermissions };
}

function graphApiReason(error: unknown) {
  if (error instanceof FacebookGraphApiError) {
    const code = error.code ? ` code ${error.code}` : "";
    const type = error.type ? ` type ${error.type}` : "";
    const subcode = error.error_subcode ? ` subcode ${error.error_subcode}` : "";
    return `Facebook subscribe webhook failed: HTTP ${error.status}${code}${type}${subcode}: ${error.message}`;
  }
  return safeErrorMessage(error);
}

function uniquePermissions(permissions: string[]) {
  return [...new Set(permissions)];
}
