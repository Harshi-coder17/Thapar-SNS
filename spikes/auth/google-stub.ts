// AUTH SPIKE. A local stand-in for Google's OAuth token and key endpoints, so the real Better Auth
// Google provider code path (state, PKCE, ID token, `hd`) runs without real credentials.
// It intercepts only Google's URLs; every other request goes to the real fetch.
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export interface GoogleClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  hd?: string;
  name?: string;
}

interface IssuedCode {
  claims: GoogleClaims;
  codeChallenge: string;
  redirectUri: string;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function createGoogleStub(clientId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomBytes(8).toString("hex");
  const codes = new Map<string, IssuedCode>();
  const tokenRequests: Array<{ codeVerifierMatched: boolean; redirectUriMatched: boolean }> = [];

  function signIdToken(claims: GoogleClaims): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
    const payload = b64url(JSON.stringify({ iss: "https://accounts.google.com", aud: clientId, iat: now, exp: now + 3600, ...claims }));
    const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
    return `${header}.${payload}.${b64url(signature)}`;
  }

  /** Simulates the user approving consent at Google: returns an authorization code. */
  function issueCode(claims: GoogleClaims, codeChallenge: string, redirectUri: string): string {
    const code = randomBytes(16).toString("hex");
    codes.set(code, { claims, codeChallenge, redirectUri });
    return code;
  }

  async function handle(url: string, init?: RequestInit): Promise<Response | undefined> {
    if (url.startsWith(CERTS_URL)) {
      const jwk = publicKey.export({ format: "jwk" });
      return Response.json({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] });
    }
    if (url.startsWith(TOKEN_URL)) {
      const body = new URLSearchParams(typeof init?.body === "string" ? init.body : String(init?.body ?? ""));
      const issued = codes.get(body.get("code") ?? "");
      if (!issued) return Response.json({ error: "invalid_grant" }, { status: 400 });
      codes.delete(body.get("code")!); // codes are single-use
      const verifier = body.get("code_verifier") ?? "";
      const codeVerifierMatched = b64url(createHash("sha256").update(verifier).digest()) === issued.codeChallenge;
      const redirectUriMatched = body.get("redirect_uri") === issued.redirectUri;
      tokenRequests.push({ codeVerifierMatched, redirectUriMatched });
      if (!codeVerifierMatched || !redirectUriMatched) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({
        access_token: randomBytes(16).toString("hex"),
        id_token: signIdToken(issued.claims),
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      });
    }
    return undefined;
  }

  return { issueCode, handle, tokenRequests, signIdToken };
}

export type GoogleStub = ReturnType<typeof createGoogleStub>;

/** Replaces global fetch with one that answers Google's URLs from the stub. Returns a restore function. */
export function installGoogleStub(stub: GoogleStub): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body = init?.body;
    if (input instanceof Request && body === undefined) body = await input.clone().text();
    const answered = await stub.handle(url, { ...init, body });
    return answered ?? realFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}
