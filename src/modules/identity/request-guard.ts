import { checkRequestOrigin, isStateChangingMethod } from "@/shared/security/origin";

import type { IdentityAuth } from "./auth";
import type { IdentityConfig } from "./config";
import { logIdentityError } from "./safe-log";

// Outer allow-list for /api/auth/* (C3, defence in depth). Better Auth's `disabledPaths` compares
// literal paths and cannot disable parameterised routes such as /reset-password/:token, so only
// these exact request paths are forwarded to Better Auth; everything else is answered with 404.

const AUTH_BASE_PATH = "/api/auth";

export function isAllowedAuthRequest(method: string, pathname: string, googleConfigured: boolean): boolean {
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return false;
  const path = pathname.slice(AUTH_BASE_PATH.length).replace(/\/+$/, "");
  switch (path) {
    case "/sign-in/social":
      return method === "POST" && googleConfigured;
    case "/callback/google":
      // Google redirects back with GET (default query response mode; form_post is never requested).
      // The callback is protected by OAuth state bound to a signed browser cookie, plus PKCE.
      return method === "GET" && googleConfigured;
    case "/sign-out":
      return method === "POST";
    default:
      return false;
  }
}

/**
 * The production entry point for /api/auth/*: allow-list (C3), strict same-origin check for every
 * state-changing request (OI-52, in addition to Better Auth's own check, C2), then Better Auth.
 * Errors are logged safely (C7).
 */
export async function dispatchAuthRequest(auth: IdentityAuth, config: Pick<IdentityConfig, "baseURL" | "google">, request: Request): Promise<Response> {
  if (!isAllowedAuthRequest(request.method, new URL(request.url).pathname, config.google !== null)) {
    return new Response("Not Found", { status: 404 });
  }
  if (isStateChangingMethod(request.method) && checkRequestOrigin(request, config.baseURL) !== "ok") {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    return await auth.handler(request);
  } catch (error) {
    logIdentityError("auth request failed", error);
    return new Response(null, { status: 500 });
  }
}
