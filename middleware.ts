import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const bearer = request.headers.get("authorization")?.toLowerCase().startsWith("bearer ");
  const isAuthPage = pathname === "/login";
  const isAuthApi = pathname === "/api/auth" || pathname.startsWith("/api/auth/");
  const isV1 = pathname === "/api/v1" || pathname.startsWith("/api/v1/");
  const isV1Keys = pathname === "/api/v1/keys" || pathname.startsWith("/api/v1/keys/");

  if (isV1 && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  if (isAuthApi || (isV1 && !isV1Keys)) return NextResponse.next();

  if (isAuthPage) {
    if (token) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!token && !bearer) {
    if (pathname.startsWith("/api/")) {
      const headers = isV1 ? CORS : undefined;
      return NextResponse.json({ error: "未登录" }, { status: 401, headers });
    }
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
