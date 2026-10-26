import { matesApi } from "@/modules/findmates";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ connectionId: string }> };

export async function GET(request: Request, { params }: Context) {
  return matesApi.messages(request, (await params).connectionId);
}

export async function POST(request: Request, { params }: Context) {
  return matesApi.send(request, (await params).connectionId);
}
