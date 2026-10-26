import { facultyApi } from "@/modules/faculty";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ claimId: string }> };

/** ADR-0010 §2 (platform capacity: ?as=admin). */
export async function POST(request: Request, { params }: Context) {
  return facultyApi.decide(request, (await params).claimId);
}
