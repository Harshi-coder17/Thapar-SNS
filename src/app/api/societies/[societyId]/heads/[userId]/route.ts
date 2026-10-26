import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string; userId: string }> };

/** Removes someone's Head access; never the last Head of an active society. */
export async function DELETE(request: Request, { params }: Context) {
  const { societyId, userId } = await params;
  return societiesApi().removeHead(request, societyId, userId);
}
