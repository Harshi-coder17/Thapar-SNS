import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, createNonce } from "@/shared/security/csp";

describe("Content-Security-Policy", () => {
  const production = buildContentSecurityPolicy({
    nonce: "abc",
    development: false,
    https: true,
  });

  it("allows scripts only with the request nonce, without eval, in production", () => {
    expect(production).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(production).not.toContain("unsafe-eval");
    expect(production).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("blocks inline <style> elements and allows inline styles only as attributes", () => {
    expect(production).toContain("style-src 'self' 'nonce-abc';");
    expect(production).toContain("style-src-attr 'unsafe-inline'");
    expect(production).not.toMatch(/style-src(-elem)? [^;]*'unsafe-inline'/);
  });

  it("blocks framing, plugins, base-tag and cross-origin form hijacking", () => {
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) {
      expect(production).toContain(directive);
    }
  });

  it("adds eval only for development and upgrade-insecure-requests only over https", () => {
    const local = buildContentSecurityPolicy({
      nonce: "abc",
      development: true,
      https: false,
    });
    expect(local).toContain("'unsafe-eval'");
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(production).toContain("upgrade-insecure-requests");
  });

  it("adds only well-formed storage and realtime origins, to img-src and connect-src only", () => {
    const withServices = buildContentSecurityPolicy({ nonce: "abc", development: false, https: true, storageOrigin: "https://storage.example.com/bucket/key", realtimeOrigin: "wss://rt.example.com/ws" });
    expect(withServices).toContain("img-src 'self' blob: data: https://storage.example.com;");
    expect(withServices).toContain("connect-src 'self' https://storage.example.com wss://rt.example.com;");
    expect(withServices).not.toMatch(/script-src[^;]*storage/);
    const hostile = buildContentSecurityPolicy({ nonce: "abc", development: false, https: true, storageOrigin: "javascript:alert(1)", realtimeOrigin: "https://not-a-websocket.example.com; script-src *" });
    expect(hostile).toContain("connect-src 'self';");
    expect(hostile).toContain("img-src 'self' blob: data:;");
    expect(production).toContain("connect-src 'self';");
  });

  it("creates a different base64 nonce for every request", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
