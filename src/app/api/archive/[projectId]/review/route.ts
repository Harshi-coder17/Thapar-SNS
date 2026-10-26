import { archiveApi } from "@/modules/archive";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string }> };

/** FR-ARC-2 (platform capacity: ?as=admin). */
export async function POST(request: Request, { params }: Context) {
  return archiveApi.review(request, (await params).projectId);
}
