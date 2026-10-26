import { archive } from "@/modules/archive";
import { handleAssetFile } from "@/modules/assets";
import { getCurrentSession } from "@/modules/identity";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string; assetId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Archive screenshots: only when the project is visible to the viewer (FR-ARC-2). */
export async function GET(request: Request, { params }: Context) {
  const { projectId, assetId } = await params;
  const session = await getCurrentSession(request.headers).catch(() => null);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!UUID.test(projectId) || !UUID.test(assetId) || !(await archive.screenshotVisible(session.user.id, session.user.role === "ADMIN", projectId, assetId))) return new Response("Not Found", { status: 404 });
  return handleAssetFile(request, assetId, ["ARCHIVE_SCREENSHOT"]);
}
