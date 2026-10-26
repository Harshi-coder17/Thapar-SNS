import { facultyApi } from "@/modules/faculty";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string }> };

export async function POST(request: Request, { params }: Context) {
  return facultyApi.claim(request, (await params).profileId);
}
