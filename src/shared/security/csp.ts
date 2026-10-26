// Content-Security-Policy (threat model §5; Next.js nonce pattern, nextjs.org/docs/app/guides/
// content-security-policy, checked 2026-10-24). Scripts need the per-request nonce
// ('strict-dynamic' lets Next.js load its chunks). Stylesheets: same-origin files, or <style>
// elements carrying the nonce (StyleNonce passes it to libraries that inject styles). Inline style
// ATTRIBUTES are allowed (style-src-attr only), because next/image and Next.js set them and nonces
// cannot cover attributes (measured 2026-10-24). Attribute styles cannot execute code.

export interface CspOptions {
  nonce: string;
  /** React development tooling needs 'unsafe-eval'; production never gets it. */
  development: boolean;
  /** Only HTTPS origins get upgrade-insecure-requests (it would break plain-http local runs). */
  https: boolean;
  /**
   * Object storage origin (S3_ENDPOINT): browsers upload to it with signed PUT URLs and load approved
   * images from short-lived signed GET URLs (Slice 2d).
   */
  storageOrigin?: string | null;
  /** Realtime WebSocket origin (ADR-0012), e.g. ws://127.0.0.1:4100. */
  realtimeOrigin?: string | null;
}

/** Only well-formed http(s)/ws(s) origins are ever added to the policy. */
function origin(value: string | null | undefined, protocols: string[]): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ nonce, development, https, storageOrigin, realtimeOrigin }: CspOptions): string {
  const storage = origin(storageOrigin, ["http:", "https:"]);
  const realtime = origin(realtimeOrigin, ["ws:", "wss:"]);
  const extra = (...values: (string | null)[]) => values.filter(Boolean).map((v) => ` ${v}`).join("");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data:${extra(storage)}`,
    "font-src 'self'",
    `connect-src 'self'${extra(storage, realtime)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

/** A fresh, unpredictable nonce for one response. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
