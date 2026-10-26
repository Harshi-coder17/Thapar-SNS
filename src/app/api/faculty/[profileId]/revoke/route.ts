import { facultyApi } from "@/modules/faculty";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string }> };

/** ADR-0010 §4 (platform capacity: ?as=admin). */
export async function POST(request: Request, { params }: Context) {
  return facultyApi.revoke(request, (await params).profileId);
}
