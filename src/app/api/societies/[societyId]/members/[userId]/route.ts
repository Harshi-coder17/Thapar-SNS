import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string; userId: string }> };

/** Any Head sets a member's display group and title (display only, never a permission). */
export async function PATCH(request: Request, { params }: Context) {
  const { societyId, userId } = await params;
  return societiesApi().updateMemberDisplay(request, societyId, userId);
}

/** A Head removes a member; with the caller's own id, the caller leaves the society. */
export async function DELETE(request: Request, { params }: Context) {
  const { societyId, userId } = await params;
  return societiesApi().removeMember(request, societyId, userId);
}
