import { matesApi } from "@/modules/findmates";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ requestId: string; responseId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { requestId, responseId } = await params;
  return matesApi.decide(request, requestId, responseId);
}
