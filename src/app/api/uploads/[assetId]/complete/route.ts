import { handleUploadComplete } from "@/modules/assets";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ assetId: string }> };

export async function POST(request: Request, { params }: Context) {
  return handleUploadComplete(request, (await params).assetId);
}
