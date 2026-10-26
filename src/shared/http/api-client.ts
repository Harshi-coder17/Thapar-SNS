// Browser-side helper for calling our JSON API (docs/api/README.md error shape). Same-origin fetch:
// the browser sends the Origin header and the HttpOnly session cookie, which the server checks.

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; status: number; message: string; fields: Record<string, string> };

/**
 * Calls the API. A 401 means the session has ended (inactivity, time limit, sign-out elsewhere or
 * revocation): unless the caller handles it itself, open forms are asked to keep their drafts and the
 * browser goes to the login page with an explanation (docs/auth/session-policy.md).
 */
export async function callApi<T = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown, options: { handleUnauthorized?: boolean } = {}): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!response) return { ok: false, status: 0, message: "Could not reach the server. Check your connection and try again.", fields: {} };
  const data = (await response.json().catch(() => null)) as { error?: { message?: string; fields?: Record<string, string> } } | null;
  if (response.ok) return { ok: true, data: data as T };
  if (response.status === 401 && !options.handleUnauthorized && typeof window !== "undefined") {
    window.dispatchEvent(new Event("thapar:session-ending"));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is intended after the session ends
    setTimeout(() => window.location.assign("/login?reason=expired"), 50);
  }
  return { ok: false, status: response.status, message: data?.error?.message ?? "Something went wrong. Please try again.", fields: data?.error?.fields ?? {} };
}
