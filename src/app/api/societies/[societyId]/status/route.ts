import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

export async function PUT(request: Request, { params }: Context) {
  return societiesApi().setActive(request, (await params).societyId);
}
