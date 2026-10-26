import "server-only";

// HTTP handlers for the societies API (docs/api/societies.md). Same order as the identity API:
// strict Origin check (OI-52), per-address rate limit, session with a completed profile (FR-AUTH-2),
// per-user rate limit, then the service, which re-checks permissions per row from the database.
// Fails closed: if the rate-limit store or the session lookup is unavailable, the request is
// refused (503) and nothing is changed. Errors are logged by name only (C7).
import type { CurrentSession, RateLimiter, RateRule } from "@/modules/identity";
import type { PrismaClient } from "@/shared/db/client";
import { jsonError, rejectCrossOrigin } from "@/shared/http/responses";

import type { Actor, IdentityPort, Result } from "./service";
import * as service from "./service";

export interface SocietiesHttpDeps {
  prisma: PrismaClient;
  baseURL: string;
  identity: IdentityPort;
  readSession: (headers: Headers, options?: { touch?: boolean }) => Promise<CurrentSession | null>;
  limiter: RateLimiter;
  clientAddress: (headers: Headers) => string;
  /** Assets module: the caller's own upload for a purpose (Slice 2d). */
  ownedAsset: (userId: string, assetId: string, purpose: "SOCIETY_LOGO" | "SOCIETY_BANNER") => Promise<{ ok: boolean; code?: string; message?: string }>;
}

/** Limits per client address (before authentication) and per user (after it). */
export const SOCIETIES_API_LIMITS = {
  write: { perAddress: { window: 60, max: 120 }, perUser: { window: 60, max: 60 } },
  posts: { perAddress: { window: 60, max: 60 }, perUser: { window: 60, max: 20 } },
  admin: { perAddress: { window: 60, max: 60 }, perUser: { window: 60, max: 30 } },
} as const satisfies Record<string, { perAddress: RateRule; perUser: RateRule }>;

type LimitName = keyof typeof SOCIETIES_API_LIMITS;

const NO_STORE = { "cache-control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Refused {
  constructor(readonly response: Response) {}
}

function logSocietiesError(context: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[societies] ${context}: ${name}`);
}

async function limit(deps: SocietiesHttpDeps, key: string, rule: RateRule): Promise<void> {
  const decision = await deps.limiter(`societies:${key}`, rule);
  if (!decision.allowed) {
    const response = jsonError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.");
    response.headers.set("retry-after", String(decision.retryAfterSeconds));
    throw new Refused(response);
  }
}

function toResponse<T>(result: Result<T>, success: (value: T) => Response): Response {
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
  }
}

/**
 * The capacity a request acts in (ADR-0013 §3.4, platform admin vs society Head):
 * - "society": society powers only, from an active Head grant; `?as=admin` is refused.
 * - "platform": platform-admin oversight only; the account's ADMIN role is required.
 * - "either": society by default; `?as=admin` selects the platform capacity (ADMIN role required).
 * The capacity only narrows which powers are considered; it never adds any.
 */
type Capacity = "society" | "platform" | "either";

interface ActionSpec<T> {
  name: string;
  limit: LimitName;
  capacity?: Capacity;
  /** Path ids that must be UUIDs; anything else is a 404 before any work. */
  ids: string[];
  /** Whether the request has a JSON body. */
  body?: boolean;
  run: (actor: Actor, body: unknown) => Promise<Result<T>>;
  status?: number;
  output?: (value: T) => unknown;
}

/** Runs one state-changing API call with every guard, failing closed with a safe 503. */
async function action<T>(deps: SocietiesHttpDeps, request: Request, spec: ActionSpec<T>): Promise<Response> {
  try {
    const rejected = rejectCrossOrigin(request, deps.baseURL);
    if (rejected) return rejected;
    const rules = SOCIETIES_API_LIMITS[spec.limit];
    await limit(deps, `${spec.limit}:addr:${deps.clientAddress(request.headers)}`, rules.perAddress);
    // Every societies API call is a submitted change, i.e. user activity (session policy).
    const session = await deps.readSession(request.headers, { touch: true });
    if (!session) return jsonError(401, "UNAUTHENTICATED", "Sign in to continue.");
    if (!session.profileComplete) return jsonError(403, "PROFILE_INCOMPLETE", "Complete your profile first.");
    await limit(deps, `${spec.limit}:user:${session.user.id}`, rules.perUser);
    if (!spec.ids.every((id) => UUID.test(id))) return jsonError(404, "NOT_FOUND", "Not found.");
    const body = spec.body ? await request.json().catch(() => undefined) : undefined;
    if (spec.body && (body === undefined || body === null || typeof body !== "object")) return jsonError(400, "VALIDATION", "Send a JSON object.");
    const wantsAdmin = new URL(request.url).searchParams.get("as") === "admin";
    const capacity = spec.capacity ?? "society";
    const platform = capacity === "platform" || (capacity === "either" && wantsAdmin);
    if ((capacity === "society" && wantsAdmin) || (platform && session.user.role !== "ADMIN")) {
      return jsonError(403, "FORBIDDEN", "You do not have permission to do this.");
    }
    const result = await spec.run({ userId: session.user.id, globalRole: session.user.role, capacity: platform ? "platform" : "society" }, body);
    return toResponse(result, (value) => Response.json(spec.output ? spec.output(value) : { ok: true }, { status: spec.status ?? 200, headers: NO_STORE }));
  } catch (error) {
    if (error instanceof Refused) return error.response;
    logSocietiesError(`${spec.name} failed`, error);
    return jsonError(503, "UNAVAILABLE", "The service is temporarily unavailable. Please try again.");
  }
}

/** Route handlers, one per endpoint in docs/api/societies.md. */
export function societiesHandlers(deps: SocietiesHttpDeps) {
  const { prisma, identity } = deps;
  return {
    createSociety: (request: Request) =>
      action(deps, request, {
        name: "create society",
        limit: "admin",
        capacity: "platform",
        ids: [],
        body: true,
        status: 201,
        run: (actor, body) => service.createSociety(prisma, identity, actor, body),
        output: (value) => ({ society: value }),
      }),
    updateSociety: (request: Request, societyId: string) =>
      action(deps, request, { name: "update society", limit: "write", capacity: "either", ids: [societyId], body: true, run: (actor, body) => service.updateSociety(prisma, actor, societyId, body) }),
    setImage: (request: Request, societyId: string) =>
      action(deps, request, { name: "set image", limit: "write", capacity: "either", ids: [societyId], body: true, run: (actor, body) => service.setSocietyImage(prisma, actor, societyId, body, deps.ownedAsset) }),
    setActive: (request: Request, societyId: string) =>
      action(deps, request, { name: "set active", limit: "admin", capacity: "platform", ids: [societyId], body: true, run: (actor, body) => service.setSocietyActive(prisma, actor, societyId, body) }),
    // Heads (ADR-0013): active Heads and platform admins; the service enforces the at-least-one rule.
    addHead: (request: Request, societyId: string) =>
      action(deps, request, { name: "add head", limit: "admin", capacity: "either", ids: [societyId], body: true, status: 201, run: (actor, body) => service.addHead(prisma, identity, actor, societyId, body) }),
    removeHead: (request: Request, societyId: string, userId: string) =>
      action(deps, request, { name: "remove head", limit: "admin", capacity: "either", ids: [societyId, userId], run: (actor) => service.removeHead(prisma, actor, societyId, userId) }),
    handOver: (request: Request, societyId: string) =>
      action(deps, request, { name: "hand over", limit: "admin", ids: [societyId], body: true, run: (actor, body) => service.handOver(prisma, identity, actor, societyId, body) }),
    reviewFaculty: (request: Request, societyId: string, associationId: string) =>
      action(deps, request, {
        name: "review faculty",
        limit: "admin",
        capacity: "platform",
        ids: [societyId, associationId],
        body: true,
        run: (actor, body) => service.reviewFacultyAssociation(prisma, actor, societyId, associationId, body),
      }),
    follow: (request: Request, societyId: string) =>
      action(deps, request, { name: "follow", limit: "write", ids: [societyId], run: (actor) => service.followSociety(prisma, actor, societyId) }),
    unfollow: (request: Request, societyId: string) =>
      action(deps, request, { name: "unfollow", limit: "write", ids: [societyId], run: (actor) => service.unfollowSociety(prisma, actor, societyId) }),
    requestMembership: (request: Request, societyId: string) =>
      action(deps, request, {
        name: "request membership",
        limit: "write",
        ids: [societyId],
        body: true,
        status: 201,
        run: (actor, body) => service.requestMembership(prisma, actor, societyId, body),
        output: (value) => ({ request: { id: value.requestId } }),
      }),
    cancelMembershipRequest: (request: Request, societyId: string) =>
      action(deps, request, { name: "cancel request", limit: "write", ids: [societyId], run: (actor) => service.cancelMembershipRequest(prisma, actor, societyId) }),
    decideMembershipRequest: (request: Request, societyId: string, requestId: string) =>
      action(deps, request, {
        name: "decide request",
        limit: "write",
        ids: [societyId, requestId],
        body: true,
        run: (actor, body) => service.decideMembershipRequest(prisma, actor, societyId, requestId, body),
      }),
    updateMemberDisplay: (request: Request, societyId: string, userId: string) =>
      action(deps, request, {
        name: "member display",
        limit: "write",
        ids: [societyId, userId],
        body: true,
        run: (actor, body) => service.updateMemberDisplay(prisma, actor, societyId, userId, body),
      }),
    removeMember: (request: Request, societyId: string, userId: string) =>
      action(deps, request, { name: "remove member", limit: "write", ids: [societyId, userId], run: (actor) => service.removeMember(prisma, actor, societyId, userId) }),
    createPost: (request: Request, societyId: string) =>
      action(deps, request, {
        name: "create post",
        limit: "posts",
        ids: [societyId],
        body: true,
        status: 201,
        run: (actor, body) => service.createPost(prisma, identity, actor, societyId, body),
        output: (value) => ({ post: value }),
      }),
    updatePost: (request: Request, societyId: string, postId: string) =>
      action(deps, request, { name: "update post", limit: "posts", ids: [societyId, postId], body: true, run: (actor, body) => service.updatePost(prisma, identity, actor, societyId, postId, body) }),
    deletePost: (request: Request, societyId: string, postId: string) =>
      action(deps, request, { name: "delete post", limit: "posts", ids: [societyId, postId], run: (actor) => service.deletePost(prisma, actor, societyId, postId) }),
  };
}

export type SocietiesHandlers = ReturnType<typeof societiesHandlers>;
