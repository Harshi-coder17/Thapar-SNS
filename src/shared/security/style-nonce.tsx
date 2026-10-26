"use client";

import { useEffect } from "react";

declare global {
  var __webpack_nonce__: string | undefined;
}

/**
 * Hands this response's CSP nonce to UI libraries that inject <style> elements at runtime (Radix's
 * scroll lock reads `__webpack_nonce__` through get-nonce), so style-src needs no 'unsafe-inline'.
 */
export function StyleNonce({ nonce }: { nonce: string | undefined }) {
  useEffect(() => {
    if (nonce) globalThis.__webpack_nonce__ = nonce;
  }, [nonce]);
  return null;
}
