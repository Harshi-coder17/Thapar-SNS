// Friendly messages for sign-in errors returned to /login?error=<code> (Better Auth onAPIError).
// Messages never reveal why an identity was rejected beyond what the user can act on.

const MESSAGES: Record<string, string> = {
  unable_to_create_user: "Sign in with your verified @thapar.edu Google account.",
  unable_to_create_session: "Sign in with your verified @thapar.edu Google account.",
  access_denied: "Sign-in was cancelled.",
  state_mismatch: "Your sign-in attempt expired. Please try again.",
  please_restart_the_process: "Your sign-in attempt expired. Please try again.",
  invalid_code: "Your sign-in attempt expired. Please try again.",
};

export const GENERIC_SIGN_IN_ERROR = "Sign-in failed. Please try again.";

export function describeSignInError(code: string | undefined | null): string | null {
  if (!code) return null;
  return MESSAGES[code.toLowerCase()] ?? GENERIC_SIGN_IN_ERROR;
}
