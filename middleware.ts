import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "staypilot-secret-change-in-production"
);

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health",
  "/api/integrations/beds24/webhook", "/api/integrations/booking/webhook",
  "/api/integrations/website/webhook", "/api/availability"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/")) {
    const token = req.cookies.get("sp_session")?.value;
    if (!token) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return NextResponse.redirect(new URL("/login", req.url));
    }
    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
