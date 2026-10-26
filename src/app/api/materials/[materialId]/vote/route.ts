import { materialsApi } from "@/modules/studymaterial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ materialId: string }> };

/** FR-MAT-4: one upvote per student. */
export async function PUT(request: Request, { params }: Context) {
  return materialsApi.vote(request, (await params).materialId, true);
}

export async function DELETE(request: Request, { params }: Context) {
  return materialsApi.vote(request, (await params).materialId, false);
}
