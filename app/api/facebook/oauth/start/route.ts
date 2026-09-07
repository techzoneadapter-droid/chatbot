import { NextResponse } from "next/server";
import { createOAuthState, graphVersion, oauthRedirectUri } from "@/lib/facebook/oauth";

export const dynamic = "force-dynamic";

const MESSENGER_SCOPES = ["public_profile", "pages_show_list", "pages_manage_metadata", "pages_messaging"];

export async function GET() {
  try {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) throw new Error("FACEBOOK_APP_ID is not configured");

    const state = createOAuthState();
    const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", oauthRedirectUri());
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", MESSENGER_SCOPES.join(","));

    const response = NextResponse.redirect(url);
    response.cookies.set("fb_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/"
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/facebook-pages?facebook_error=config", process.env.APP_URL || "http://localhost:3000"));
  }
}
