import { placementApi } from "@/modules/placement";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ recordId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  return placementApi.remove(request, (await params).recordId);
}
