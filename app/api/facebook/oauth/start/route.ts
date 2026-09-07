import { NextResponse } from "next/server";
import { createOAuthState, facebookLoginUrl } from "@/lib/facebook/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = createOAuthState();
    const response = NextResponse.redirect(facebookLoginUrl(state));
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
