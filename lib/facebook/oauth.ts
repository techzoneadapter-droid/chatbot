import { createHmac, randomBytes } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const FACEBOOK_PERMISSIONS = [
  "public_profile",
  "business_management",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_read_user_content"
] as const;

export const REQUIRED_PAGE_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_read_user_content"
] as const;

export const COMMENT_AUTOMATION_PERMISSIONS = ["pages_manage_engagement", "pages_read_user_content"] as const;

export type FacebookTokenPermission = { permission: string; status: string };

export interface FacebookOAuthPage {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  source?: "oauth_granted" | "me_accounts" | "business_owned_pages" | "business_client_pages";
  business_id?: string;
  business_name?: string;
  token_status?: "ready" | "business_permission_no_page_token";
}

export interface StoredFacebookOAuthSession {
  id: string;
  createdAt: number;
  pages: FacebookOAuthPage[];
  warnings?: string[];
  userPermissions?: FacebookTokenPermission[];
}

interface FacebookBusiness {
  id: string;
  name?: string;
}

const oauthGlobal = globalThis as typeof globalThis & {
  facebookOAuthSessions?: Map<string, StoredFacebookOAuthSession>;
};

const sessionStore: Map<string, StoredFacebookOAuthSession> =
  oauthGlobal.facebookOAuthSessions ?? (oauthGlobal.facebookOAuthSessions = new Map<string, StoredFacebookOAuthSession>());
const OAUTH_SESSION_TTL_MS = 20 * 60 * 1000;

export function appUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function graphVersion() {
  const version = process.env.FACEBOOK_GRAPH_API_VERSION || process.env.FACEBOOK_GRAPH_VERSION || "v26.0";
  return version.startsWith("v") ? version : `v${version}`;
}

export function oauthRedirectUri() {
  return `${appUrl()}/api/facebook/oauth/callback`;
}

export function createOAuthState() {
  return randomBytes(24).toString("hex");
}

export async function createOAuthSession(pages: FacebookOAuthPage[], warnings: string[] = [], userPermissions: FacebookTokenPermission[] = []) {
  sweepExpiredSessions();
  const id = randomBytes(24).toString("hex");
  const session = { id, createdAt: Date.now(), pages, warnings, userPermissions };
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    await supabase.from("facebook_oauth_sessions").insert({
      session_id: id,
      pages: { pages, warnings, userPermissions },
      expires_at: new Date(Date.now() + OAUTH_SESSION_TTL_MS).toISOString()
    });
  }
  console.info("[facebook-oauth] oauth session created", { sessionId: id, candidates: pages.length, tokenType: "USER" });
  sessionStore.set(id, session);
  return session;
}

export async function getOAuthSession(id: string | null | undefined) {
  if (!id) return null;
  sweepExpiredSessions();
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const { data } = await supabase.from("facebook_oauth_sessions").select("*").eq("session_id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) {
      const stored = data.pages as unknown;
      const pages = Array.isArray(stored) ? stored : (stored as { pages?: FacebookOAuthPage[] } | null)?.pages ?? [];
      const warnings = Array.isArray(stored) ? [] : (stored as { warnings?: string[] } | null)?.warnings ?? [];
      const userPermissions = Array.isArray(stored) ? [] : (stored as { userPermissions?: FacebookTokenPermission[] } | null)?.userPermissions ?? [];
      return {
        id,
        createdAt: new Date(String(data.created_at)).getTime(),
        pages,
        warnings,
        userPermissions
      };
    }
  }
  return sessionStore.get(id) ?? null;
}

export async function consumeOAuthPages(sessionId: string, pageIds: string[]) {
  const session = await getOAuthSession(sessionId);
  if (!session) return [];
  const wanted = new Set(pageIds);
  const selected = session.pages.filter((page) => wanted.has(page.id));
  session.pages = session.pages.filter((page) => !wanted.has(page.id));
  const supabase = createServiceSupabaseClient();
  if (session.pages.length === 0) {
    sessionStore.delete(sessionId);
    if (supabase) await supabase.from("facebook_oauth_sessions").delete().eq("session_id", sessionId);
  } else if (supabase) {
    await supabase.from("facebook_oauth_sessions").update({ pages: { pages: session.pages, warnings: session.warnings ?? [], userPermissions: session.userPermissions ?? [] } }).eq("session_id", sessionId);
  }
  return selected;
}

export function facebookLoginUrl(state: string) {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) throw new Error("FACEBOOK_APP_ID is not configured");
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FACEBOOK_PERMISSIONS.join(","));
  console.info("[facebook-oauth] login url scopes", { scopes: FACEBOOK_PERMISSIONS.join(","), tokenType: "USER" });
  return url.toString();
}

export async function exchangeCodeForUserToken(code: string) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Facebook app credentials are not configured");
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("code", code);
  const response = await fetch(url);
  const payload = (await response.json()) as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !payload.access_token) throw new Error(payload.error?.message ?? "Facebook OAuth failed");
  return String(payload.access_token);
}

export async function getLongLivedUserToken(shortToken: string) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return shortToken;
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const response = await fetch(url);
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
  return response.ok && payload.access_token ? String(payload.access_token) : shortToken;
}

export async function getOAuthGrantedPageIds(userAccessToken: string) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return [];
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/debug_token`);
  url.searchParams.set("input_token", userAccessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url);
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> };
    error?: { message?: string };
  };
  if (!response.ok) {
    console.info("[facebook-oauth] oauth granted page ids failed", { message: payload.error?.message ?? "unknown" });
    return [];
  }
  const ids = new Set<string>();
  for (const scope of payload.data?.granular_scopes ?? []) {
    if (!scope.scope?.startsWith("pages_")) continue;
    for (const id of scope.target_ids ?? []) ids.add(String(id));
  }
  return [...ids];
}

export async function listUserPages(userAccessToken: string): Promise<FacebookOAuthPage[]> {
  const pages = await fetchGraphPages("me/accounts", userAccessToken, "me_accounts");
  console.info("[facebook-oauth] me/accounts pages", { count: pages.length });
  return pages;
}

export async function listAvailablePages(userAccessToken: string) {
  const warnings: string[] = [];
  const userPermissions = await getTokenPermissions(userAccessToken);
  console.info("[facebook-oauth] user token permissions", {
    tokenType: "USER",
    permissions: userPermissions.map((item) => `${item.permission}:${item.status}`)
  });
  const grantedPageIds = await getOAuthGrantedPageIds(userAccessToken);
  const grantedPageIdSet = new Set(grantedPageIds);
  const grantedUserPermissions = userPermissions.filter((item) => item.status === "granted").map((item) => item.permission);
  const missingBusinessPermissions = ["business_management"].filter((permission) => !grantedUserPermissions.includes(permission));
  const pageMap = new Map<string, FacebookOAuthPage>();
  let businessCount = 0;
  let ownedPagesCount = 0;
  let clientPagesCount = 0;

  const mePages = await listUserPages(userAccessToken);
  for (const page of mePages) pageMap.set(page.id, page);
  console.info(`[facebook-oauth] oauth granted page ids: ${grantedPageIds.length}`);

  const grantedPages = await Promise.all(grantedPageIds.map((id) => hydratePageCandidate({ id, name: `Page ${id}`, source: "oauth_granted" }, userAccessToken)));
  for (const page of grantedPages) pageMap.set(page.id, mergePage(pageMap.get(page.id), { ...page, source: page.source ?? "oauth_granted" }));

  if (missingBusinessPermissions.length) {
    warnings.push(`Missing permission for Business assets: ${missingBusinessPermissions.join(", ")}`);
    console.info("[facebook-oauth] business discovery skipped", { missingPermissions: missingBusinessPermissions });
  } else {
    try {
      const businesses = await fetchGraphCollection<FacebookBusiness>("me/businesses", userAccessToken, {
        fields: "id,name",
        limit: "100"
      });
      businessCount = businesses.length;
      console.info(`[facebook-oauth] businesses: ${businessCount}`);

      for (const business of businesses) {
        try {
          const ownedPages = await fetchGraphPages(`${business.id}/owned_pages`, userAccessToken, "business_owned_pages", business);
          ownedPagesCount += ownedPages.length;
          for (const page of ownedPages) pageMap.set(page.id, mergePage(pageMap.get(page.id), page));
        } catch (error) {
          console.info("[facebook-oauth] owned_pages failed", { businessId: business.id, message: safeErrorMessage(error) });
        }

        try {
          const clientPages = await fetchGraphPages(`${business.id}/client_pages`, userAccessToken, "business_client_pages", business);
          clientPagesCount += clientPages.length;
          for (const page of clientPages) pageMap.set(page.id, mergePage(pageMap.get(page.id), page));
        } catch (error) {
          console.info("[facebook-oauth] client_pages failed", { businessId: business.id, message: safeErrorMessage(error) });
        }
      }
    } catch (error) {
      warnings.push("Cannot read Business assets with the granted token.");
      console.info("[facebook-oauth] business discovery failed", { message: safeErrorMessage(error) });
    }
  }

  const discoveredPages = [...pageMap.values()];
  const pages = grantedPageIdSet.size ? discoveredPages.filter((page) => grantedPageIdSet.has(page.id)) : [];
  if (grantedPageIdSet.size === 0) {
    warnings.push("Facebook did not return granted Page IDs, so no Page candidates were shown.");
  }
  console.info(`[facebook-oauth] me/accounts: ${mePages.length}`);
  console.info(`[facebook-oauth] businesses: ${businessCount}`);
  console.info(`[facebook-oauth] owned_pages: ${ownedPagesCount}`);
  console.info(`[facebook-oauth] client_pages: ${clientPagesCount}`);
  console.info(`[facebook-oauth] merged unique pages: ${pages.length}`);
  console.info(`[facebook-oauth] pages with token: ${pages.filter((page) => page.access_token).length}`);
  console.info(`[facebook-oauth] pages without token: ${pages.filter((page) => !page.access_token).length}`);
  console.info("[facebook-oauth] page discovery summary", {
    businesses: businessCount,
    meAccounts: mePages.length,
    ownedPages: ownedPagesCount,
    clientPages: clientPagesCount,
    mergedPages: pages.length,
    pagesWithToken: pages.filter((page) => page.access_token).length,
    pagesWithoutToken: pages.filter((page) => !page.access_token).length
  });

  return { pages, warnings, userPermissions };
}

export async function inspectPageToken(pageId: string, pageAccessToken: string): Promise<{
  ok: boolean;
  profile: { id?: string; name?: string; picture?: { data?: { url?: string } } };
  appSubscribed: boolean;
  subscribedAppIds: string[];
  subscribedFields: string[];
  granted: string[];
  missing: string[];
  missingCommentAutomation: string[];
  error?: { status: number; code?: number; type?: string; message: string; error_subcode?: number };
}> {
  const profileResponse = await fetch(graphUrl(pageId, pageAccessToken, { fields: "id,name,picture{url}" }));
  const profile = (await profileResponse.json().catch(() => ({}))) as { id?: string; name?: string; picture?: { data?: { url?: string } }; error?: { code?: number; type?: string; message?: string; error_subcode?: number } };
  const subscribedApps = profileResponse.ok ? await getSubscribedApps(pageId, pageAccessToken) : [];
  const subscribedFields = [...new Set(subscribedApps.flatMap((item) => item.subscribed_fields ?? []))];
  const appId = process.env.FACEBOOK_APP_ID;
  const appSubscribed = appId ? subscribedApps.some((item) => String(item.id) === appId) : subscribedApps.length > 0;
  const permissions = profileResponse.ok ? await getTokenPermissions(pageAccessToken).catch(() => []) : [];
  const granted = permissions.filter((item) => item.status === "granted").map((item) => item.permission);
  const missing = permissions.length ? REQUIRED_PAGE_PERMISSIONS.filter((permission) => !granted.includes(permission)) : [];
  return {
    ok: profileResponse.ok && String(profile.id) === pageId,
    profile,
    appSubscribed,
    subscribedAppIds: subscribedApps.map((item) => String(item.id)).filter(Boolean),
    subscribedFields,
    granted,
    missing,
    missingCommentAutomation: COMMENT_AUTOMATION_PERMISSIONS.filter((permission) => missing.includes(permission)),
    error: profileResponse.ok
      ? undefined
      : {
          status: profileResponse.status,
          code: profile.error?.code,
          type: profile.error?.type,
          message: profile.error?.message ?? "Cannot inspect Page token",
          error_subcode: profile.error?.error_subcode
        }
  };
}

export async function getTokenPermissions(accessToken: string): Promise<FacebookTokenPermission[]> {
  const response = await fetch(graphUrl("me/permissions", accessToken));
  const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ permission: string; status: string }> };
  if (!response.ok) return [];
  return payload.data ?? [];
}

export async function subscribePageToWebhook(pageId: string, pageAccessToken: string) {
  const url = graphUrl(`${pageId}/subscribed_apps`, pageAccessToken, {
    subscribed_fields: "messages,messaging_postbacks,feed"
  });
  const response = await fetch(url, { method: "POST" });
  const payload = (await response.json().catch(() => ({}))) as { error?: { code?: number; type?: string; message?: string; error_subcode?: number } };
  if (!response.ok) {
    const message = payload.error?.message ?? "Cannot subscribe Page webhook";
    console.error("[facebook-graph] subscribe webhook failed", {
      pageId,
      status: response.status,
      code: payload.error?.code ?? null,
      type: payload.error?.type ?? null,
      error_subcode: payload.error?.error_subcode ?? null,
      message
    });
    throw new FacebookGraphApiError(message, {
      status: response.status,
      code: payload.error?.code,
      type: payload.error?.type,
      error_subcode: payload.error?.error_subcode
    });
  }
  return payload;
}

export async function unsubscribePageFromWebhook(pageId: string, pageAccessToken: string) {
  const response = await fetch(graphUrl(`${pageId}/subscribed_apps`, pageAccessToken), { method: "DELETE" });
  const payload = (await response.json().catch(() => ({}))) as { error?: { code?: number; type?: string; message?: string; error_subcode?: number } };
  if (!response.ok) {
    throw new FacebookGraphApiError(payload.error?.message ?? "Cannot unsubscribe Page webhook", {
      status: response.status,
      code: payload.error?.code,
      type: payload.error?.type,
      error_subcode: payload.error?.error_subcode
    });
  }
  return payload;
}

async function getSubscribedApps(pageId: string, pageAccessToken: string) {
  const response = await fetch(graphUrl(`${pageId}/subscribed_apps`, pageAccessToken));
  const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ id?: string; name?: string; subscribed_fields?: string[] }> };
  if (!response.ok) return [];
  return payload.data ?? [];
}

export class FacebookGraphApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly type?: string;
  readonly error_subcode?: number;

  constructor(message: string, details: { status: number; code?: number; type?: string; error_subcode?: number }) {
    super(message);
    this.name = "FacebookGraphApiError";
    this.status = details.status;
    this.code = details.code;
    this.type = details.type;
    this.error_subcode = details.error_subcode;
  }
}

export function graphUrl(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
  url.searchParams.set("access_token", accessToken);
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (secret) url.searchParams.set("appsecret_proof", createHmac("sha256", secret).update(accessToken).digest("hex"));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function fetchGraphPages(
  path: string,
  userAccessToken: string,
  source: NonNullable<FacebookOAuthPage["source"]>,
  business?: FacebookBusiness
): Promise<FacebookOAuthPage[]> {
  const isMeAccounts = source === "me_accounts";
  const pages = await fetchGraphCollection<FacebookOAuthPage>(path, userAccessToken, {
    fields: isMeAccounts ? "id,name,access_token,tasks,picture{url}" : "id,name,tasks,picture{url}",
    limit: "100"
  });
  const withTokens = await Promise.all(
    pages.map(async (page) => {
      const hydrated = page.access_token ? { ...page, token_status: "ready" as const } : await hydratePageCandidate(page, userAccessToken);
      return {
        ...hydrated,
        source,
        business_id: business?.id,
        business_name: business?.name
      };
    })
  );
  if (business) {
    console.info("[facebook-oauth] business page edge", {
      edge: source,
      businessId: business.id,
      count: withTokens.length,
      withToken: withTokens.filter((page) => page.access_token).length
    });
  }
  return withTokens;
}

async function hydratePageCandidate(page: FacebookOAuthPage, userAccessToken: string): Promise<FacebookOAuthPage> {
  let candidate = page;
  try {
    const profile = await fetchGraphObject<FacebookOAuthPage>(candidate.id, userAccessToken, {
      fields: "id,name,tasks,picture{url}"
    });
    candidate = {
      ...candidate,
      ...profile,
      picture: profile.picture ?? candidate.picture
    };
  } catch {
    // Keep OAuth/business candidates visible even when Meta refuses profile hydration.
  }

  if (candidate.access_token) return { ...candidate, token_status: "ready" };

  const accessToken = await fetchPageAccessToken(candidate.id, userAccessToken);
  return accessToken
    ? { ...candidate, access_token: accessToken, token_status: "ready" }
    : { ...candidate, token_status: "business_permission_no_page_token" };
}

async function fetchPageAccessToken(pageId: string, userAccessToken: string) {
  try {
    const tokenResult = await fetchGraphObject<{ id?: string; access_token?: string }>(pageId, userAccessToken, {
      fields: "id,access_token"
    });
    if (String(tokenResult.id) !== pageId || !tokenResult.access_token) return undefined;
    return String(tokenResult.access_token);
  } catch {
    return undefined;
  }
}

function mergePage(existing: FacebookOAuthPage | undefined, next: FacebookOAuthPage) {
  if (!existing) return next;
  return {
    ...existing,
    ...next,
    access_token: next.access_token ?? existing.access_token,
    tasks: next.tasks ?? existing.tasks,
    picture: next.picture ?? existing.picture,
    source: next.source ?? existing.source,
    business_id: next.business_id ?? existing.business_id,
    business_name: next.business_name ?? existing.business_name,
    token_status: next.token_status ?? existing.token_status
  };
}

async function fetchGraphCollection<T>(path: string, accessToken: string, params: Record<string, string> = {}) {
  const rows: T[] = [];
  let nextUrl: string | null = graphUrl(path, accessToken, params).toString();
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const payload = (await response.json().catch(() => ({}))) as { data?: T[]; paging?: { next?: string }; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Facebook Graph request failed: ${path}`);
    rows.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;
  }
  return rows;
}

async function fetchGraphObject<T>(path: string, accessToken: string, params: Record<string, string> = {}) {
  const response = await fetch(graphUrl(path, accessToken, params));
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Facebook Graph request failed: ${path}`);
  return payload;
}

export function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/access_token=[^&\s]+/g, "access_token=REDACTED") : "unknown";
}

function sweepExpiredSessions() {
  const expiresBefore = Date.now() - OAUTH_SESSION_TTL_MS;
  for (const [id, session] of sessionStore.entries()) {
    if (session.createdAt < expiresBefore) sessionStore.delete(id);
  }
}
