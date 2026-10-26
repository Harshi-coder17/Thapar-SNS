import { eventIsPublic } from "@/modules/events";
import { participantConnection } from "@/modules/findmates";
import { apiDeps } from "@/modules/identity";
import { forbidden, invalid, ok, RATE, runAction } from "@/shared/http/api-action";
import { signTicket } from "@/shared/security/realtime-ticket";

export const dynamic = "force-dynamic";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHANNEL = new RegExp(`^(user|event|connection):(${UUID})$`, "i");

/**
 * ADR-0012: a 30-second, single-use ticket for the realtime server, naming only channels the caller
 * may receive, each checked against the database now: their own user channel, public events, and
 * chat connections they take part in. Any channel that fails the check refuses the whole request.
 */
export async function POST(request: Request) {
  return runAction(apiDeps(), request, {
    name: "realtime:ticket",
    // A cheap, read-like request repeated on every page view: the read limits apply, so students
    // sharing one campus address are not throttled (OWASP review 2026-10-25).
    rules: RATE.read,
    // Requested in the background on every page: never counts as user activity (session policy).
    activity: false,
    body: true,
    run: async (actor, body) => {
      const requested = (body as { channels?: unknown }).channels;
      if (!Array.isArray(requested) || requested.length > 20 || !requested.every((c) => typeof c === "string" && CHANNEL.test(c))) return invalid({ channels: "Request up to 20 valid channels." });
      const channels = [...new Set([`user:${actor.userId}`, ...(requested as string[]).map((c) => c.toLowerCase())])];
      for (const channel of channels) {
        const [kind, id] = channel.split(":") as [string, string];
        const allowed = kind === "user" ? id === actor.userId : kind === "event" ? await eventIsPublic(id) : (await participantConnection(actor.userId, id)) !== null;
        if (!allowed) return forbidden;
      }
      return ok({ ticket: signTicket(actor.userId, channels), url: process.env.REALTIME_PUBLIC_URL ?? "ws://127.0.0.1:4100/ws", channels });
    },
  });
}
