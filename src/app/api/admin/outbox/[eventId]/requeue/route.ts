import { audit } from "@/modules/admin";
import { apiDeps } from "@/modules/identity";
import { nudge, requeueDead } from "@/modules/outbox";
import { getDb } from "@/shared/db/client";
import { notFound, ok, RATE, runAction } from "@/shared/http/api-action";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

/** Re-queue a DEAD outbox event (platform capacity: ?as=admin; background-jobs.md §3.3). */
export async function POST(request: Request, { params }: Context) {
  const { eventId } = await params;
  const response = await runAction(apiDeps(), request, {
    name: "admin:requeue",
    rules: RATE.admin,
    ids: [eventId],
    capacity: "platform",
    run: async (actor) => {
      if (!(await requeueDead(getDb(), eventId))) return notFound;
      await audit(getDb(), { actorId: actor.userId, action: "admin.outbox.requeued", targetType: "outbox_event", targetId: eventId });
      return ok(undefined);
    },
  });
  if (response.ok) await nudge();
  return response;
}
