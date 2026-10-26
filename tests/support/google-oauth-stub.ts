// Test support: a local stand-in for Google's OAuth token and key endpoints, so the real Better
// Auth Google provider path (authorize URL, state, PKCE, token exchange, ID token, `hd`) runs
// without credentials or network access. Only Google's two URLs are intercepted.
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

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function createGoogleStub(clientId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = randomBytes(8).toString("hex");
  const codes = new Map<string, { claims: GoogleClaims; codeChallenge: string; redirectUri: string }>();
  const tokenRequests: Array<{ codeVerifierMatched: boolean; redirectUriMatched: boolean }> = [];

  function signIdToken(claims: GoogleClaims): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
    const payload = b64url(JSON.stringify({ iss: "https://accounts.google.com", aud: clientId, iat: now, exp: now + 3600, ...claims }));
    return `${header}.${payload}.${b64url(createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey))}`;
  }

  function issueCode(claims: GoogleClaims, codeChallenge: string, redirectUri: string): string {
    const code = randomBytes(16).toString("hex");
    codes.set(code, { claims, codeChallenge, redirectUri });
    return code;
  }

  async function handle(url: string, body: string | undefined): Promise<Response | undefined> {
    if (url.startsWith(CERTS_URL)) return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] });
    if (!url.startsWith(TOKEN_URL)) return undefined;
    const params = new URLSearchParams(body ?? "");
    const issued = codes.get(params.get("code") ?? "");
    if (!issued) return Response.json({ error: "invalid_grant" }, { status: 400 });
    codes.delete(params.get("code")!); // single use
    const codeVerifierMatched = b64url(createHash("sha256").update(params.get("code_verifier") ?? "").digest()) === issued.codeChallenge;
    const redirectUriMatched = params.get("redirect_uri") === issued.redirectUri;
    tokenRequests.push({ codeVerifierMatched, redirectUriMatched });
    if (!codeVerifierMatched || !redirectUriMatched) return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json({ access_token: randomBytes(16).toString("hex"), id_token: signIdToken(issued.claims), expires_in: 3600, token_type: "Bearer", scope: "openid email profile" });
  }

  return { issueCode, handle, tokenRequests };
}

export type GoogleStub = ReturnType<typeof createGoogleStub>;

/** Routes Google's URLs to the stub; everything else goes to the real fetch. Returns a restore function. */
export function installGoogleStub(stub: GoogleStub): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : undefined;
    if (input instanceof Request && body === undefined) body = await input.clone().text();
    return (await stub.handle(url, body)) ?? realFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}
