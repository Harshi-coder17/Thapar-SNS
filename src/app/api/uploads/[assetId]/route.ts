import { ownUploadStatus } from "@/modules/assets";
import { apiDeps } from "@/modules/identity";
import { ok, RATE, runAction } from "@/shared/http/api-action";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assetId: string }> };

/** The caller's own upload status (AWAITING_UPLOAD, UPLOADED, SCANNING, APPROVED, REJECTED with reason). */
export async function GET(request: Request, { params }: Context) {
  const { assetId } = await params;
  return runAction(apiDeps(), request, {
    name: "assets:status",
    rules: RATE.read,
    ids: [assetId],
    run: async (actor) => {
      const status = await ownUploadStatus(actor.userId, assetId);
      return status ? ok(status) : { ok: false, code: "NOT_FOUND" };
    },
  });
}
