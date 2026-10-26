import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return societiesApi().updateSociety(request, (await params).societyId);
}
