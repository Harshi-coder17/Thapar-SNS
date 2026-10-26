import { createReport } from "@/modules/admin";
import { apiDeps } from "@/modules/identity";
import { getDb } from "@/shared/db/client";
import { RATE, runAction } from "@/shared/http/api-action";

import { moderationTargets } from "@/app/(app)/_lib/moderation-targets";

export const dynamic = "force-dynamic";

/** Report content for moderation (once per item per user). */
export async function POST(request: Request) {
  return runAction(apiDeps(), request, { name: "reports:create", rules: RATE.create, body: true, status: 201, run: (actor, body) => createReport(getDb(), moderationTargets, actor, body), output: (v) => ({ report: v }) });
}
