// AUTH SPIKE (ADR-0005/0006, gate G-1b-spike). Not production-approved.
//
// Wraps a Better Auth database adapter so the `session.token` column stores SHA-256(token) and never
// the raw token. The raw token exists only in the user's cookie. Design notes and the source audit
// are in docs/auth/spike-findings.md.
import { createHash } from "node:crypto";

import type { BetterAuthOptions, DBAdapter, Where } from "better-auth";

type AdapterFactory = (options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>;
type Row = Record<string, unknown>;

const SESSION_MODEL = "session";
const TOKEN_FIELD = "token";

/**
 * Prefix for stored hashes handed back to Better Auth when the raw token is unknown (for example
 * when listing a user's sessions). Every filter value is hashed, including marked values, so a
 * stored hash can never match, authenticate, or revoke anything. Token-based revocation of other
 * sessions therefore does not work; revocation is done by session id instead (spike finding F-04).
 */
export const HASHED_TOKEN_MARKER = "hashed:";

/** Every adapter member reviewed for this wrapper (better-auth 1.7.10). Anything else fails closed. */
const REVIEWED_MEMBERS = new Set([
  "id", "create", "findOne", "findMany", "count", "update", "updateMany", "delete", "deleteMany",
  "consumeOne", "incrementOne", "transaction", "createSchema", "options",
]);

export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("base64url");
}

/** Observes every call that reaches the underlying adapter (used by tests to prove no raw token leaks). */
export type BaseCallObserver = (method: string, args: unknown) => void;

type TokenMap = Map<string, string>; // stored hash -> raw token known in this call

function transformWhere(where: Where[] | undefined, tokens: TokenMap): Where[] | undefined {
  if (!where) return where;
  return where.map((clause) => {
    if (clause.field !== TOKEN_FIELD) return clause;
    const operator = clause.operator ?? "eq";
    if (operator !== "eq" && operator !== "in") {
      throw new Error(`hashed-session-adapter: unsupported operator "${operator}" on session.token`);
    }
    const mapValue = (value: unknown): string => {
      if (typeof value !== "string") throw new Error("hashed-session-adapter: session.token filter must be a string");
      const hashed = hashSessionToken(value);
      tokens.set(hashed, value);
      return hashed;
    };
    const value = Array.isArray(clause.value) ? clause.value.map(mapValue) : mapValue(clause.value);
    return { ...clause, value } as Where;
  });
}

function restoreRow(row: unknown, tokens: TokenMap): unknown {
  if (!row || typeof row !== "object") return row;
  const copy: Row = { ...(row as Row) };
  const stored = copy[TOKEN_FIELD];
  if (typeof stored === "string") copy[TOKEN_FIELD] = tokens.get(stored) ?? `${HASHED_TOKEN_MARKER}${stored}`;
  return copy;
}

function restore(model: string, result: unknown, tokens: TokenMap): unknown {
  if (model === SESSION_MODEL) {
    return Array.isArray(result) ? result.map((row) => restoreRow(row, tokens)) : restoreRow(result, tokens);
  }
  // Joined session rows on other models (e.g. user with sessions) are restored the same way.
  const restoreJoins = (row: unknown) => {
    if (!row || typeof row !== "object") return row;
    const copy: Row = { ...(row as Row) };
    for (const key of [SESSION_MODEL, `${SESSION_MODEL}s`]) {
      const joined = copy[key];
      if (Array.isArray(joined)) copy[key] = joined.map((r) => restoreRow(r, tokens));
      else if (joined && typeof joined === "object") copy[key] = restoreRow(joined, tokens);
    }
    return copy;
  };
  return Array.isArray(result) ? result.map(restoreJoins) : restoreJoins(result);
}

function hashTokenInData(data: Row | undefined, tokens: TokenMap): Row | undefined {
  if (!data || typeof data[TOKEN_FIELD] !== "string") return data;
  const raw = data[TOKEN_FIELD] as string;
  const hashed = hashSessionToken(raw);
  tokens.set(hashed, raw);
  return { ...data, [TOKEN_FIELD]: hashed };
}

// The adapter's methods are generic and overloaded; the wrapper works on their runtime shape.
type AnyAdapter = Record<string, unknown>;
type AdapterMethod = (args: Row) => Promise<unknown>;
type TransactionMethod = (callback: (trx: AnyAdapter) => Promise<unknown>) => Promise<unknown>;

function wrapAdapter(base: AnyAdapter, observe?: BaseCallObserver): AnyAdapter {
  const unreviewed = Object.keys(base).filter((key) => !REVIEWED_MEMBERS.has(key));
  if (unreviewed.length > 0) {
    throw new Error(`hashed-session-adapter: unreviewed adapter members ${unreviewed.join(", ")}; review before upgrading better-auth`);
  }

  const call = async (method: string, args: Row) => {
    observe?.(method, args);
    return (base[method] as AdapterMethod)(args);
  };

  const withWhere = (method: string) => async (args: Row) => {
    const tokens: TokenMap = new Map();
    const model = args.model as string;
    if (model !== SESSION_MODEL) return restore(model, await call(method, args), tokens);
    const next: Row = { ...args, where: transformWhere(args.where as Where[], tokens) };
    if (args.update) next.update = hashTokenInData(args.update as Row, tokens);
    if (args.set) next.set = hashTokenInData(args.set as Row, tokens);
    return restore(model, await call(method, next), tokens);
  };

  const wrapped: AnyAdapter = {
    ...base,
    async create(args: Row) {
      const tokens: TokenMap = new Map();
      const model = args.model as string;
      const next = model === SESSION_MODEL ? { ...args, data: hashTokenInData(args.data as Row, tokens) } : args;
      return restore(model, await call("create", next), tokens);
    },
    findOne: withWhere("findOne"),
    findMany: withWhere("findMany"),
    count: withWhere("count"),
    update: withWhere("update"),
    updateMany: withWhere("updateMany"),
    incrementOne: withWhere("incrementOne"),
    delete: withWhere("delete"),
    deleteMany: withWhere("deleteMany"),
    consumeOne: withWhere("consumeOne"),
    async transaction(callback: (trx: AnyAdapter) => Promise<unknown>) {
      return (base.transaction as TransactionMethod)((trx) => callback(wrapAdapter(trx, observe)));
    },
  };
  return wrapped;
}

/** Wraps an adapter factory (e.g. `prismaAdapter(prisma, ...)`) with session-token hashing. */
export function withHashedSessionTokens(factory: AdapterFactory, observe?: BaseCallObserver): AdapterFactory {
  return (options) => wrapAdapter(factory(options) as unknown as AnyAdapter, observe) as unknown as DBAdapter<BetterAuthOptions>;
}
