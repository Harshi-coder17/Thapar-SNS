import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

/** Slice 2d: set or clear the logo or banner ({ kind, assetId }). */
export async function PUT(request: Request, { params }: Context) {
  return societiesApi().setImage(request, (await params).societyId);
}
