import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/shared/env";

const valid = {
  DATABASE_URL: "postgresql://user:pw@127.0.0.1:55432/db",
  S3_ENDPOINT: "http://127.0.0.1:3900",
  S3_REGION: "garage",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY_ID: "id",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("parseServerEnv", () => {
  it("accepts a complete configuration", () => {
    expect(parseServerEnv(valid).S3_BUCKET).toBe("bucket");
  });

  it("names missing keys without echoing secret values", () => {
    const { S3_SECRET_ACCESS_KEY: _omit, ...rest } = valid;
    expect(() => parseServerEnv({ ...rest, DATABASE_URL: "not-a-url" })).toThrow(
      "Invalid or missing server environment variables: DATABASE_URL, S3_SECRET_ACCESS_KEY",
    );
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://u:p@h/db" })).toThrow("DATABASE_URL");
  });

  it("never includes values in the error message", () => {
    try {
      parseServerEnv({ ...valid, S3_ENDPOINT: "not a url" });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain("pw@");
    }
  });
});
