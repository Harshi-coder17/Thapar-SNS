import { type NextRequest, NextResponse } from "next/server";

import { hasSessionCookie, sessionCookieRefresh } from "@/modules/identity";
import { buildContentSecurityPolicy, createNonce } from "@/shared/security/csp";

// Runs before every page request (Next.js 16 proxy, Node.js runtime):
// 1. a per-request CSP nonce, applied by Next.js to its own scripts (pages render dynamically);
// 2. the sliding session-cookie refresh (OI-05), only when a session cookie is present.
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
    storageOrigin: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT,
    realtimeOrigin: process.env.REALTIME_PUBLIC_URL ?? "ws://127.0.0.1:4100",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  if (hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))) {
    for (const setCookie of await sessionCookieRefresh(request.headers)) response.headers.append("set-cookie", setCookie);
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes, static files and the logo do not need a CSP nonce or session refresh.
      source: "/((?!api|_next/static|_next/image|favicon.ico|brand/|icons/|sw.js|offline.html|offline.css|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
