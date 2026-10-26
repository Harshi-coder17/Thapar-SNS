import { checkRequestOrigin } from "@/shared/security/origin";

// JSON error shape for route handlers (docs/api/README.md): { error: { code, message, fields? } }.

export function jsonError(status: number, code: string, message: string, fields?: Record<string, string>): Response {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status, headers: { "cache-control": "no-store" } });
}

/** CSRF protection for our own state-changing endpoints (OI-52): a 403 response, or null if allowed. */
export function rejectCrossOrigin(request: Request, trustedOrigin: string): Response | null {
  return checkRequestOrigin(request, trustedOrigin) === "ok" ? null : jsonError(403, "FORBIDDEN_ORIGIN", "Request rejected.");
}
