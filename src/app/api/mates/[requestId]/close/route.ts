import { matesApi } from "@/modules/findmates";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ requestId: string }> };

export async function POST(request: Request, { params }: Context) {
  return matesApi.close(request, (await params).requestId);
}
