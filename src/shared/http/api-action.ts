// Generic guarded API action for module route handlers (same rules as the identity and societies
// APIs): strict Origin check for state-changing methods (OI-52), per-address rate limit, session with
// a completed profile (FR-AUTH-2), per-user rate limit, UUID path ids, JSON body, then the module
// service, which re-checks permissions from the database. Fails closed: if the rate-limit store or the
// session lookup is unavailable, the request is refused (503) and nothing is changed. Errors are
// logged by name only (C7). Module-agnostic: modules inject the identity functions.
import { jsonError, rejectCrossOrigin } from "./responses";

export interface RateRule {
  window: number;
  max: number;
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** The signed-in user as a module sees it (from identity's CurrentSession). */
export interface ApiSession {
  user: { id: string; role: "STUDENT" | "FACULTY" | "ADMIN"; name: string; email: string };
  profileComplete: boolean;
}

export interface ApiDeps {
  baseURL: string;
  /** `touch`: this request is a user action and extends the session's inactivity limit. */
  readSession: (headers: Headers, options?: { touch?: boolean }) => Promise<ApiSession | null>;
  limiter: (key: string, rule: RateRule) => Promise<RateDecision>;
  clientAddress: (headers: Headers) => string;
}

export type ServiceResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; code: "VALIDATION"; fields: Record<string, string> }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" }
  | { ok: false; code: "CONFLICT" | "INVALID_STATE" | "TOO_LARGE" | "RATE_LIMITED"; message: string };

export const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
export const notFound = { ok: false, code: "NOT_FOUND" } as const;
export const forbidden = { ok: false, code: "FORBIDDEN" } as const;
export const invalid = (fields: Record<string, string>) => ({ ok: false, code: "VALIDATION", fields }) as const;
export const conflict = (message: string) => ({ ok: false, code: "CONFLICT", message }) as const;
export const invalidState = (message: string) => ({ ok: false, code: "INVALID_STATE", message }) as const;

/** The actor passed to services: the user and the capacity the request acts in. */
export interface ApiActor {
  userId: string;
  globalRole: "STUDENT" | "FACULTY" | "ADMIN";
  /** "platform" only when requested AND the ADMIN role is confirmed (ADR-0013 §13). */
  capacity: "personal" | "platform";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "cache-control": "no-store" };

class Refused {
  constructor(readonly response: Response) {}
}

export interface ActionSpec<T> {
  /** Module and action name for logs and rate-limit keys, e.g. "events:register". */
  name: string;
  rules: { perAddress: RateRule; perUser: RateRule };
  ids?: string[];
  body?: boolean;
  /** "personal" (default), "platform" (admin only), or "either" (`?as=admin` selects platform). */
  capacity?: "personal" | "platform" | "either";
  /** Read-only GET actions skip the Origin check (it applies to state-changing methods only). */
  run: (actor: ApiActor, body: unknown, request: Request) => Promise<ServiceResult<T>>;
  status?: number;
  output?: (value: T) => unknown;
  /**
   * Whether this request counts as user activity for the session's inactivity limit. Default: true for
   * changes (non-GET), false for reads. Background requests such as realtime tickets set false.
   */
  activity?: boolean;
  /** Largest accepted JSON body in bytes (default 64 KB). */
  maxBodyBytes?: number;
  /** Builds a non-JSON success response (e.g. a file download); replaces `output` and `status`. */
  respond?: (value: T) => Response;
  /** Allow a signed-in user with an incomplete profile (rarely needed). */
  allowIncompleteProfile?: boolean;
}

export function toResponse<T>(result: ServiceResult<T>, success: (value: T) => Response): Response {
  if (result.ok) return success(result.value);
  switch (result.code) {
    case "VALIDATION":
      return jsonError(400, "VALIDATION", "Check the highlighted fields.", result.fields);
    case "NOT_FOUND":
      return jsonError(404, "NOT_FOUND", "Not found.");
    case "FORBIDDEN":
      return jsonError(403, "FORBIDDEN", "You do not have permission to do this.");
    case "CONFLICT":
      return jsonError(409, "CONFLICT", result.message);
    case "INVALID_STATE":
      return jsonError(422, "INVALID_STATE", result.message);
    case "TOO_LARGE":
      return jsonError(413, "TOO_LARGE", result.message);
    case "RATE_LIMITED":
      return jsonError(429, "RATE_LIMITED", result.message);
  }
}

function logError(name: string, error: unknown): void {
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[api] ${name} failed: ${kind}`);
}

async function limit(deps: ApiDeps, key: string, rule: RateRule): Promise<void> {
  const decision = await deps.limiter(key, rule);
  if (!decision.allowed) {
    const response = jsonError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.");
    response.headers.set("retry-after", String(decision.retryAfterSeconds));
    throw new Refused(response);
  }
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/** Runs one API call with every guard; any failure becomes a safe 503. */
export async function runAction<T>(deps: ApiDeps, request: Request, spec: ActionSpec<T>): Promise<Response> {
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      const rejected = rejectCrossOrigin(request, deps.baseURL);
      if (rejected) return rejected;
    }
    await limit(deps, `${spec.name}:addr:${deps.clientAddress(request.headers)}`, spec.rules.perAddress);
    // Submitted changes are user activity; reads (and background requests) are not.
    const session = await deps.readSession(request.headers, { touch: spec.activity ?? !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) });
    if (!session) return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
    if (!session.profileComplete && !spec.allowIncompleteProfile) return jsonError(403, "PROFILE_INCOMPLETE", "Complete your profile first.");
    await limit(deps, `${spec.name}:user:${session.user.id}`, spec.rules.perUser);
    if (!(spec.ids ?? []).every((id) => UUID.test(id))) return jsonError(404, "NOT_FOUND", "Not found.");

    const wantsAdmin = new URL(request.url).searchParams.get("as") === "admin";
    const capacity = spec.capacity ?? "personal";
    const platform = capacity === "platform" || (capacity === "either" && wantsAdmin);
    if ((capacity === "personal" && wantsAdmin) || (platform && session.user.role !== "ADMIN")) {
      return jsonError(403, "FORBIDDEN", "You do not have permission to do this.");
    }

    let body: unknown;
    if (spec.body) {
      const max = spec.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
      const declared = Number(request.headers.get("content-length") ?? "0");
      if (declared > max) return jsonError(413, "TOO_LARGE", "The request is too large.");
      const text = await request.text();
      if (new TextEncoder().encode(text).length > max) return jsonError(413, "TOO_LARGE", "The request is too large.");
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      if (body === undefined || body === null || typeof body !== "object") return jsonError(400, "VALIDATION", "Send a JSON object.");
    }
    const actor: ApiActor = { userId: session.user.id, globalRole: session.user.role, capacity: platform ? "platform" : "personal" };
    const result = await spec.run(actor, body, request);
    return toResponse(result, (value) => spec.respond ? spec.respond(value) : Response.json(spec.output ? spec.output(value) : (value ?? { ok: true }), { status: spec.status ?? 200, headers: NO_STORE }));
  } catch (error) {
    if (error instanceof Refused) return error.response;
    // The browser went away mid-request (e.g. it navigated): nothing to answer and nothing to log.
    if (request.signal?.aborted) return new Response(null, { status: 499 });
    logError(spec.name, error);
    return jsonError(503, "UNAVAILABLE", "The service is temporarily unavailable. Please try again.");
  }
}

/** Standard per-address and per-user limits (fixed 60-second windows). */
export const RATE = {
  read: { perAddress: { window: 60, max: 300 }, perUser: { window: 60, max: 180 } },
  write: { perAddress: { window: 60, max: 120 }, perUser: { window: 60, max: 60 } },
  /** Content creation (posts, events, requests, messages, uploads). */
  create: { perAddress: { window: 60, max: 60 }, perUser: { window: 60, max: 20 } },
  admin: { perAddress: { window: 60, max: 120 }, perUser: { window: 60, max: 60 } },
} as const satisfies Record<string, { perAddress: RateRule; perUser: RateRule }>;

/** True when a path id is a UUID (for pages that look records up by id). */
export const isUuid = (value: string) => UUID.test(value);
