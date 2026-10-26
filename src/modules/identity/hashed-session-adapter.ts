import "server-only";

// Session-token hashing for Better Auth (ADR-0006, spike condition C1; reviewed against
// better-auth 1.7.10, docs/auth/spike-findings.md). The `session.token` column stores
// SHA-256(token); the raw token exists only in the user's cookie. Every filter on the token is
// hashed, so a value copied from the database can never authenticate, refresh or revoke a session.
import { createHash } from "node:crypto";

import type { BetterAuthOptions, DBAdapter, Where } from "better-auth";

type AdapterFactory = (options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>;
type Row = Record<string, unknown>;
type AnyAdapter = Record<string, unknown>;
type AdapterMethod = (args: Row) => Promise<unknown>;
type TransactionMethod = (callback: (trx: AnyAdapter) => Promise<unknown>) => Promise<unknown>;
type TokenMap = Map<string, string>; // stored hash -> raw token seen in this call

const SESSION_MODEL = "session";
const TOKEN_FIELD = "token";

/**
 * Prefix for stored hashes returned when the raw token is unknown (e.g. listing a user's
 * sessions). Marked values are hashed again like any other filter, so they never match anything.
 */
export const HASHED_TOKEN_MARKER = "hashed:";

/** Adapter members reviewed for better-auth 1.7.10. Any other member fails closed (upgrade guard). */
const REVIEWED_MEMBERS = new Set([
  "id", "create", "findOne", "findMany", "count", "update", "updateMany", "delete", "deleteMany",
  "consumeOne", "incrementOne", "transaction", "createSchema", "options",
]);

export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("base64url");
}

/** Receives every call that reaches the underlying adapter (tests use it to prove no raw token leaks). */
export type BaseCallObserver = (method: string, args: unknown) => void;

function hashFilterValue(value: unknown, tokens: TokenMap): string {
  if (typeof value !== "string") throw new Error("hashed-session-adapter: session.token filters must be strings");
  const hashed = hashSessionToken(value);
  tokens.set(hashed, value);
  return hashed;
}

function transformWhere(where: Where[] | undefined, tokens: TokenMap): Where[] | undefined {
  if (!where) return where;
  return where.map((clause) => {
    if (clause.field !== TOKEN_FIELD) return clause;
    const operator = clause.operator ?? "eq";
    if (operator !== "eq" && operator !== "in") {
      throw new Error(`hashed-session-adapter: operator "${operator}" is not allowed on session.token`);
    }
    const value = Array.isArray(clause.value)
      ? clause.value.map((v) => hashFilterValue(v, tokens))
      : hashFilterValue(clause.value, tokens);
    return { ...clause, value } as Where;
  });
}

function hashTokenInData(data: Row | undefined, tokens: TokenMap): Row | undefined {
  if (!data || !(TOKEN_FIELD in data)) return data;
  return { ...data, [TOKEN_FIELD]: hashFilterValue(data[TOKEN_FIELD], tokens) };
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
  // Session rows joined onto other models are restored the same way.
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
      if (model !== SESSION_MODEL) return restore(model, await call("create", args), tokens);
      const data = args.data as Row | undefined;
      // A session without a token would be unusable and indicates a library change: fail closed.
      if (!data || typeof data[TOKEN_FIELD] !== "string") throw new Error("hashed-session-adapter: session created without a token");
      return restore(model, await call("create", { ...args, data: hashTokenInData(data, tokens) }), tokens);
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
  };
  // Work run inside a transaction uses a separate adapter; it is wrapped too.
  if (typeof base.transaction === "function") {
    wrapped.transaction = (callback: (trx: AnyAdapter) => Promise<unknown>) =>
      (base.transaction as TransactionMethod)((trx) => callback(wrapAdapter(trx, observe)));
  }
  return wrapped;
}

/** Wraps an adapter factory (e.g. `prismaAdapter(prisma, ...)`) with session-token hashing. */
export function withHashedSessionTokens(factory: AdapterFactory, observe?: BaseCallObserver): AdapterFactory {
  return (options) => wrapAdapter(factory(options) as unknown as AnyAdapter, observe) as unknown as DBAdapter<BetterAuthOptions>;
}
