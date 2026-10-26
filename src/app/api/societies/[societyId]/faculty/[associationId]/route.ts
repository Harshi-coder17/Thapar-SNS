import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string; associationId: string }> };

/** Platform admins verify or un-verify a faculty association. */
export async function PATCH(request: Request, { params }: Context) {
  const { societyId, associationId } = await params;
  return societiesApi().reviewFaculty(request, societyId, associationId);
}
