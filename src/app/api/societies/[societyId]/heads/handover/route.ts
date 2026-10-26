import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

/** The acting Head hands their seat to an incoming Head (atomic). */
export async function POST(request: Request, { params }: Context) {
  return societiesApi().handOver(request, (await params).societyId);
}
