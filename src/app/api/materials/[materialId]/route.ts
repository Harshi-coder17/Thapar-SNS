import { materialsApi } from "@/modules/studymaterial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ materialId: string }> };

/** OI-19: the uploader deletes their own material. */
export async function DELETE(request: Request, { params }: Context) {
  return materialsApi.remove(request, (await params).materialId);
}
