import "server-only";

// E2E TEST SIGN-IN (tests/e2e only, OI-53). Bundled only into E2E builds (via e2e.ts) and enabled
// only by config.testSignInEnabled. Signs in through Better Auth's real Google ID-token path, so the
// domain policy, hooks, rate limits and cookie issuance are the production ones.
import { checkRequestOrigin } from "@/shared/security/origin";

import type { IdentityAuth } from "./auth";
import type { IdentityConfig } from "./config";
import { mintTestIdToken } from "./test-google";

/** Marks responses from this code; `npm run check:build` asserts it is absent from normal builds. */
export const TEST_SIGN_IN_MARKER = "thapar-sns-e2e-test-sign-in";

export async function testSignIn(auth: IdentityAuth, config: IdentityConfig, request: Request): Promise<Response> {
  if (!config.testSignInEnabled || !config.google) return new Response("Not Found", { status: 404 });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (checkRequestOrigin(request, config.baseURL) !== "ok") return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { email?: unknown; name?: unknown; emailVerified?: unknown; hd?: unknown } | null;
  if (!body || typeof body.email !== "string") return new Response("Bad Request", { status: 400 });
  const token = mintTestIdToken(
    {
      email: body.email,
      name: typeof body.name === "string" ? body.name : "E2E Test Student",
      emailVerified: body.emailVerified !== false,
      hd: typeof body.hd === "string" ? body.hd : config.allowedDomain,
    },
    config.google.clientId,
  );
  const headers = new Headers({ "content-type": "application/json", origin: config.baseURL });
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  // Like the real Google callback, which arrives from the browser: the session records its device.
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("user-agent", userAgent);
  const response = await auth.handler(
    new Request(`${config.baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "google", idToken: { token } }),
    }),
  );
  response.headers.set("x-test-sign-in", TEST_SIGN_IN_MARKER);
  return response;
}
