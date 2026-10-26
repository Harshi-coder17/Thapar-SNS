import "server-only";

// E2E-only entry point of the identity module, imported solely by the E2E-build route
// src/app/api/test-auth/sign-in/route.e2e.ts (lint-enforced). Never part of a normal build.
import { getIdentityRuntime } from "./runtime";
import { installTestGoogleKeys } from "./test-google";
import { testSignIn } from "./test-sign-in";

export async function handleTestSignIn(request: Request): Promise<Response> {
  const { auth, config } = getIdentityRuntime();
  if (!config.testSignInEnabled) return new Response("Not Found", { status: 404 });
  installTestGoogleKeys();
  return testSignIn(auth, config, request);
}
