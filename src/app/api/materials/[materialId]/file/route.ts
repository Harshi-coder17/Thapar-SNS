import { handleAssetFile } from "@/modules/assets";
import { materials } from "@/modules/studymaterial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ materialId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OI-18: signed-in users download a visible, approved material through a 5-minute signed URL. */
export async function GET(request: Request, { params }: Context) {
  const { materialId } = await params;
  const assetId = UUID.test(materialId) ? await materials.assetOf(materialId) : null;
  if (!assetId) return new Response("Not Found", { status: 404 });
  return handleAssetFile(request, assetId, ["STUDY_MATERIAL"]);
}
