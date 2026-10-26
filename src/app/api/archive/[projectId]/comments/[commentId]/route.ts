import { archiveApi } from "@/modules/archive";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string; commentId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  const { projectId, commentId } = await params;
  return archiveApi.deleteComment(request, projectId, commentId);
}
