import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requiredToken = process.env.ADMIN_ACCESS_TOKEN;
  if (!requiredToken) return NextResponse.json({ ok: true, devMode: true });

  const body = (await request.json()) as { token?: string };
  if (body.token !== requiredToken) {
    return NextResponse.json({ error: "Invalid admin token" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_session", requiredToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
