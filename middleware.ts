import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Middleware runs on every matched request at the edge, so we cannot throw at
// import time. Instead, a missing/short AUTH_SECRET makes every protected
// request fail closed (redirect or 401).
function getSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 24) return null;
  return new TextEncoder().encode(s);
}

// Paths that do NOT require a session cookie.
const PUBLIC_EXACT = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/health",
]);
const PUBLIC_PREFIX = [
  "/api/integrations/beds24/webhook",
  "/api/integrations/booking/webhook",
  "/api/integrations/website/webhook",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname === "/api/availability" || pathname.startsWith("/api/availability?")) return true;
  // Availability is matched without query; Next already strips query before matcher runs,
  // so check plain equality as well:
  if (pathname === "/api/availability") return true;
  for (const p of PUBLIC_PREFIX) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Availability is a public GET used by the hotel's website.
  if (pathname === "/api/availability") return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  const needsAuth =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/api/");
  if (!needsAuth) return NextResponse.next();

  const secret = getSecret();
  const token = req.cookies.get("sp_session")?.value;

  const fail = () => {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  };

  if (!secret || !token) return fail();
  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return fail();
  }
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] };
