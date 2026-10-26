import { handleCompleteProfileRequest, handleUpdateProfileRequest } from "@/modules/identity";

export const dynamic = "force-dynamic";

/** FR-AUTH-2: first-time profile completion (onboarding). */
export async function POST(request: Request) {
  return handleCompleteProfileRequest(request);
}

/** OI-35: edit your own profile afterwards (the roll number is not editable). */
export async function PATCH(request: Request) {
  return handleUpdateProfileRequest(request);
}
