import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

export async function POST(request: Request, { params }: Context) {
  return societiesApi().createPost(request, (await params).societyId);
}
