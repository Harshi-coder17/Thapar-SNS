import { facultyApi } from "@/modules/faculty";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string }> };

/** ADR-0010 §5: the linked faculty member edits the allow-listed fields. */
export async function PATCH(request: Request, { params }: Context) {
  return facultyApi.edit(request, (await params).profileId);
}
