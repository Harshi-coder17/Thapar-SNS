import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ societyId: string }> };

export async function PUT(request: Request, { params }: Context) {
  return societiesApi().follow(request, (await params).societyId);
}

export async function DELETE(request: Request, { params }: Context) {
  return societiesApi().unfollow(request, (await params).societyId);
}
