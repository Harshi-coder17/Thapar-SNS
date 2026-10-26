import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string; postId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { societyId, postId } = await params;
  return societiesApi().updatePost(request, societyId, postId);
}

export async function DELETE(request: Request, { params }: Context) {
  const { societyId, postId } = await params;
  return societiesApi().deletePost(request, societyId, postId);
}
