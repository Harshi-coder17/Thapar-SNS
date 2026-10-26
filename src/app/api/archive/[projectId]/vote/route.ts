import { archiveApi } from "@/modules/archive";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function PUT(request: Request, { params }: Context) {
  return archiveApi.vote(request, (await params).projectId, true);
}

export async function DELETE(request: Request, { params }: Context) {
  return archiveApi.vote(request, (await params).projectId, false);
}
