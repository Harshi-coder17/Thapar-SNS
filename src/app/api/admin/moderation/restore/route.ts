import { restoreTarget } from "@/modules/admin";
import { apiDeps } from "@/modules/identity";
import { getDb } from "@/shared/db/client";
import { RATE, runAction } from "@/shared/http/api-action";

import { moderationTargets } from "@/app/(app)/_lib/moderation-targets";

export const dynamic = "force-dynamic";

/** Restore hidden content (platform capacity: ?as=admin). */
export async function POST(request: Request) {
  return runAction(apiDeps(), request, { name: "admin:restore", rules: RATE.admin, body: true, capacity: "platform", run: (actor, body) => restoreTarget(getDb(), moderationTargets, actor, body) });
}
