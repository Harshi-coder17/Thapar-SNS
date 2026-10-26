import { apiDeps } from "@/modules/identity";
import { listNotifications, markRead, unreadCount } from "@/modules/notifications";
import { getDb } from "@/shared/db/client";
import { invalid, ok, RATE, runAction } from "@/shared/http/api-action";

export const dynamic = "force-dynamic";

/** The user's notifications (newest first) and unread count. */
export async function GET(request: Request) {
  return runAction(apiDeps(), request, {
    name: "notifications:list",
    rules: RATE.read,
    run: async (actor) => {
      const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
      const page = await listNotifications(getDb(), actor.userId, { cursor: cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : undefined });
      return ok({ ...page, unread: await unreadCount(getDb(), actor.userId) });
    },
  });
}

/** Mark notifications read: { ids: [...] } or { all: true }. */
export async function POST(request: Request) {
  return runAction(apiDeps(), request, {
    name: "notifications:read",
    rules: RATE.write,
    body: true,
    run: async (actor, body) => {
      const input = body as { ids?: unknown; all?: unknown };
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (input.all === true) return ok({ updated: await markRead(getDb(), actor.userId, "all") });
      if (!Array.isArray(input.ids) || input.ids.length === 0 || input.ids.length > 100 || !input.ids.every((id) => typeof id === "string" && uuid.test(id))) return invalid({ ids: "Send up to 100 notification ids." });
      return ok({ updated: await markRead(getDb(), actor.userId, input.ids as string[]) });
    },
  });
}
