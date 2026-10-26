import { handleAssetFile } from "@/modules/assets";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, { params }: Context) {
  return handleAssetFile(request, (await params).assetId);
}
