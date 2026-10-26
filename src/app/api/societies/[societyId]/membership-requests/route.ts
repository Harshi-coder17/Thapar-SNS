import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

export async function POST(request: Request, { params }: Context) {
  return societiesApi().requestMembership(request, (await params).societyId);
}

/** Withdraws the signed-in user's own pending request. */
export async function DELETE(request: Request, { params }: Context) {
  return societiesApi().cancelMembershipRequest(request, (await params).societyId);
}
