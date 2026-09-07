import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = ["/dashboard", "/conversations", "/inbox", "/campaigns", "/facebook-pages", "/leads", "/products", "/settings"];

export function middleware(request: NextRequest) {
  const requiredToken = process.env.ADMIN_ACCESS_TOKEN;
  const isProtected = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  if (!requiredToken || !isProtected) return NextResponse.next();

  const cookieToken = request.cookies.get("admin_session")?.value;
  const headerToken = request.headers.get("x-admin-access-token");
  if (cookieToken === requiredToken || headerToken === requiredToken) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/conversations/:path*", "/inbox/:path*", "/campaigns/:path*", "/facebook-pages/:path*", "/leads/:path*", "/products/:path*", "/settings/:path*"]
};
