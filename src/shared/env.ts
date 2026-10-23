import { z } from "zod";

/**
 * Server-side configuration, validated on first use (not at import time) so that
 * builds and pages that do not touch the database do not need these variables.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parses the given environment. Error messages name the missing keys, never their values. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].sort();
    throw new Error(`Invalid or missing server environment variables: ${keys.join(", ")}`);
  }
  return result.data;
}
