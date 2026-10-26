import { resolveReport } from "@/modules/admin";
import { apiDeps } from "@/modules/identity";
import { getDb } from "@/shared/db/client";
import { RATE, runAction } from "@/shared/http/api-action";

import { moderationTargets } from "@/app/(app)/_lib/moderation-targets";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reportId: string }> };

/** Resolve a report: hide the content or dismiss (platform capacity: ?as=admin). */
export async function POST(request: Request, { params }: Context) {
  const { reportId } = await params;
  return runAction(apiDeps(), request, { name: "admin:resolve", rules: RATE.admin, ids: [reportId], body: true, capacity: "platform", run: (actor, body) => resolveReport(getDb(), moderationTargets, actor, reportId, body) });
}
