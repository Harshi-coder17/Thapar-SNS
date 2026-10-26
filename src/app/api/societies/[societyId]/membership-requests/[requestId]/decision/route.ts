import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string; requestId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { societyId, requestId } = await params;
  return societiesApi().decideMembershipRequest(request, societyId, requestId);
}
