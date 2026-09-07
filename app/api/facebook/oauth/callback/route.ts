import { NextResponse } from "next/server";
import { createOAuthSession, exchangeCodeForUserToken, getLongLivedUserToken, listAvailablePages, safeErrorMessage } from "@/lib/facebook/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("cookie") ?? "";
  const expectedState = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("fb_oauth_state="))
    ?.slice("fb_oauth_state=".length);
  const appBase = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;

  if (!code || !state || !expectedState || state !== decodeURIComponent(expectedState)) {
    return redirectWithClearedState(`${appBase}/facebook-pages?facebook_error=state`);
  }

  try {
    const shortToken = await exchangeCodeForUserToken(code);
    const longToken = await getLongLivedUserToken(shortToken);
    const { pages, warnings, userPermissions } = await listAvailablePages(longToken);
    console.info(`[facebook-oauth] oauth_session candidates saved: ${pages.length}`);
    const session = await createOAuthSession(pages, warnings, userPermissions);
    return redirectWithClearedState(`${appBase}/facebook-pages?oauth_session=${session.id}`);
  } catch (error) {
    console.info("[facebook-oauth] callback failed", { message: safeErrorMessage(error) });
    return redirectWithClearedState(`${appBase}/facebook-pages?facebook_error=oauth`);
  }
}

function redirectWithClearedState(target: string) {
  const response = NextResponse.redirect(target);
  response.cookies.set("fb_oauth_state", "", { httpOnly: true, maxAge: 0, path: "/" });
  return response;
}
