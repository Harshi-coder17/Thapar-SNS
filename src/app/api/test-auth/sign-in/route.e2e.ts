import { handleTestSignIn } from "@/modules/identity/e2e";

// E2E-ONLY ROUTE. The `.e2e.ts` extension is a page extension only in E2E builds (E2E_BUILD=1, see
// next.config.ts), so normal and production builds contain neither this route nor the test sign-in
// code (verified by `npm run check:build`). Even in an E2E build it returns 404 unless the identity
// configuration enables it (loopback URL, E2E_TEST_AUTH=1, never on a deployment).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTestSignIn(request);
}
