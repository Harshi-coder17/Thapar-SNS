import type { NextConfig } from "next";

// E2E builds (OI-53): `E2E_BUILD=1 next build` (npm run test:e2e) also compiles `*.e2e.ts` route
// files, which hold the test-only sign-in, into a separate output folder. Normal and production
// builds never see those files, so the test sign-in code is not in them at all.
const e2eBuild = process.env.E2E_BUILD === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: e2eBuild ? ".next-e2e" : ".next",
  pageExtensions: e2eBuild ? ["e2e.ts", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  // Replaced at build time, so the runtime environment cannot change it (identity runtime.ts).
  env: { THAPAR_E2E_BUILD: e2eBuild ? "1" : "0" },
  reactStrictMode: true,
  // Local images (e.g. the login photograph) are served as AVIF or WebP when the browser accepts them.
  images: { formats: ["image/avif", "image/webp"] },
  // Next.js 16 `next dev` can write a managed "agent rules" block into a project file on every start.
  // That block contains em-dash characters, which the project forbids everywhere (npm run
  // check:em-dash). Disabled.
  agentRules: false,
  // CSP is set per request by src/proxy.ts (nonce); these headers are static.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Sign-in uses full-page redirects (no popups), so isolating the browsing context is safe.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // No feature in scope uses these browser capabilities; re-enable deliberately if one does.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          // Two years; includeSubDomains/preload wait for the production domain decision (gate G-1c).
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
};

export default nextConfig;
