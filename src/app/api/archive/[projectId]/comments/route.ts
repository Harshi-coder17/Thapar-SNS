import { archiveApi } from "@/modules/archive";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Context) {
  return archiveApi.comment(request, (await params).projectId);
}
