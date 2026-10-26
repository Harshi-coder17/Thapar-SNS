import "server-only";

// E2E TEST SUPPORT ONLY. Bundled only into E2E builds (via e2e.ts) and used only when the test
// sign-in is enabled (config.ts). Lets end-to-end tests sign in through Better Auth's real Google ID-token
// verification (signature, audience, issuer, `hd`, server-side domain policy, cookie issuance)
// without real Google credentials, by serving a throwaway public key for Google's key URL.
import { createSign, generateKeyPairSync, type KeyObject, randomBytes } from "node:crypto";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Key-id prefix of the throwaway keys; `npm run check:build` asserts it is absent from normal builds. */
export const TEST_GOOGLE_KEY_MARKER = "thapar-sns-e2e-test-google-key";

interface TestKeys {
  privateKey: KeyObject;
  kid: string;
  jwks: unknown;
}

const globalForTest = globalThis as typeof globalThis & { thaparSnsTestGoogle?: TestKeys };

/** Generates a throwaway key pair and answers Google's key URL with its public half. */
export function installTestGoogleKeys(): void {
  if (globalForTest.thaparSnsTestGoogle) return;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = `${TEST_GOOGLE_KEY_MARKER}-${randomBytes(6).toString("hex")}`;
  const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] };
  globalForTest.thaparSnsTestGoogle = { privateKey, kid, jwks };

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(GOOGLE_CERTS_URL)) return Response.json(jwks);
    return realFetch(input, init);
  }) as typeof fetch;
}

export interface TestGoogleClaims {
  email: string;
  name: string;
  emailVerified: boolean;
  hd?: string;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** Signs a Google-shaped ID token with the throwaway key (E2E only). */
export function mintTestIdToken(claims: TestGoogleClaims, clientId: string): string {
  const keys = globalForTest.thaparSnsTestGoogle;
  if (!keys) throw new Error("test Google keys are not installed");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: keys.kid, typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: `e2e-${b64url(claims.email.toLowerCase())}`,
    email: claims.email,
    email_verified: claims.emailVerified,
    name: claims.name,
    ...(claims.hd ? { hd: claims.hd } : {}),
    iat: now,
    exp: now + 300,
  }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(keys.privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}
