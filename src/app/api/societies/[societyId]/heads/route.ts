import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

/** Adds a Head (an active Head of the society, or a platform admin). */
export async function POST(request: Request, { params }: Context) {
  return societiesApi().addHead(request, (await params).societyId);
}
