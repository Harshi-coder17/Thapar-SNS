import { describe, expect, it } from "vitest";

import { checkRequestOrigin, isStateChangingMethod } from "@/shared/security/origin";

const APP = "https://sns.example";
const post = (headers: Record<string, string>) => new Request(`${APP}/api/x`, { method: "POST", headers });

describe("strict origin check (OI-52)", () => {
  it("accepts only the app's own origin", () => {
    expect(checkRequestOrigin(post({ origin: APP }), APP)).toBe("ok");
    expect(checkRequestOrigin(post({ origin: APP, "sec-fetch-site": "same-origin" }), APP)).toBe("ok");
  });

  it.each([
    [{}, "missing"],
    [{ origin: "" }, "missing"],
    [{ origin: "null" }, "invalid"],
    [{ origin: "not a url" }, "invalid"],
    [{ origin: `${APP}/path` }, "invalid"],
    [{ origin: "https://evil.example" }, "untrusted"],
    [{ origin: "http://sns.example" }, "untrusted"],
    [{ origin: "https://sns.example:8443" }, "untrusted"],
    [{ origin: "https://sns.example.evil.example" }, "untrusted"],
    [{ origin: APP, "sec-fetch-site": "cross-site" }, "cross-site"],
    [{ origin: APP, "sec-fetch-site": "same-site" }, "cross-site"],
    [{ origin: APP, "sec-fetch-site": "none" }, "cross-site"],
  ] as const)("rejects %j as %s", (headers, expected) => {
    expect(checkRequestOrigin(post(headers), APP)).toBe(expected);
  });

  it("treats every method except GET, HEAD and OPTIONS as state-changing", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) expect(isStateChangingMethod(method)).toBe(true);
    for (const method of ["GET", "HEAD", "OPTIONS"]) expect(isStateChangingMethod(method)).toBe(false);
  });
});
