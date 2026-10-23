import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { garageCredentials, garageToml } from "../../scripts/dev/local-secrets.mjs";

// Storage contract (ADR-0007): the S3 operations the upload pipeline relies on, run against
// Garage. The same suite is run once against Cloudflare R2 at gate G-1c.
const GARAGE_IMAGE = "dxflrs/garage:v2.4.1@sha256:9c96caa2612d3411acc5b0e6701fb238dbfba33e533a6d7d3d811a4b12d0d020";
const root = path.join(import.meta.dirname, "../..");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

const creds = garageCredentials({ accessKeyId: `GK${hex(12)}`, secretAccessKey: hex(32), bucket: "contract-test" });
let container: StartedTestContainer;
let s3: S3Client;

async function waitForBucket(client: S3Client, bucket: string) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: "ready-probe", Body: "ok" }));
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

beforeAll(async () => {
  const toml = garageToml(readFileSync(path.join(root, "docker/garage/garage.toml.template"), "utf8"), {
    rpcSecret: hex(32),
    adminToken: hex(32),
  });
  container = await new GenericContainer(GARAGE_IMAGE)
    .withCopyContentToContainer([{ content: toml, target: "/etc/garage.toml" }])
    .withEnvironment({
      GARAGE_DEFAULT_ACCESS_KEY: creds.accessKeyId,
      GARAGE_DEFAULT_SECRET_KEY: creds.secretAccessKey,
      GARAGE_DEFAULT_BUCKET: creds.bucket,
    })
    .withCommand(["/garage", "server", "--single-node", "--default-bucket"])
    .withExposedPorts(3900)
    // The image has no shell, so the default port check cannot run inside it; wait for the log line.
    .withWaitStrategy(Wait.forLogMessage(/S3 API server listening/))
    .start();

  s3 = new S3Client({
    endpoint: `http://${container.getHost()}:${container.getMappedPort(3900)}`,
    region: "garage",
    forcePathStyle: true,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    // Only send checksums when an operation requires them (Garage/R2 compatibility).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  await waitForBucket(s3, creds.bucket);
});

afterAll(async () => {
  s3?.destroy();
  await container?.stop();
});

const Bucket = () => creds.bucket;
// The SDK presigner signs only `host` by default; Content-Type must be listed explicitly so the
// storage server rejects uploads with a different type (finding recorded in ADR-0007).
const SIGN_CONTENT_TYPE = { signableHeaders: new Set(["content-type"]) };
const isClientError = (status: number) => status >= 400 && status < 500;

describe("S3 storage contract (Garage 2.4.1)", () => {
  it("accepts a presigned PUT with the signed Content-Type and serves it via presigned GET", async () => {
    const key = "quarantine/contract-pdf";
    const body = Buffer.from("%PDF-1.7 contract test");
    const putUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: Bucket(), Key: key, ContentType: "application/pdf" }), { expiresIn: 300, ...SIGN_CONTENT_TYPE });
    expect(new URL(putUrl).searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");

    const put = await fetch(putUrl, { method: "PUT", body, headers: { "Content-Type": "application/pdf" } });
    expect(put.status).toBe(200);

    const head = await s3.send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
    expect(head.ContentLength).toBe(body.length);
    expect(head.ContentType).toBe("application/pdf");

    const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: Bucket(), Key: key }), { expiresIn: 300 });
    const get = await fetch(getUrl);
    expect(Buffer.from(await get.arrayBuffer())).toEqual(body);
  });

  it("rejects a presigned PUT whose Content-Type differs from the signed one", async () => {
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: Bucket(), Key: "quarantine/wrong-type", ContentType: "application/pdf" }), { expiresIn: 300, ...SIGN_CONTENT_TYPE });
    const res = await fetch(url, { method: "PUT", body: "x", headers: { "Content-Type": "text/html" } });
    expect(res.status).toBe(403);
    await expect(s3.send(new HeadObjectCommand({ Bucket: Bucket(), Key: "quarantine/wrong-type" }))).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
  });

  it("rejects an expired presigned URL", async () => {
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: Bucket(), Key: "quarantine/expired", ContentType: "image/png" }), { expiresIn: 1, ...SIGN_CONTENT_TYPE });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const res = await fetch(url, { method: "PUT", body: "x", headers: { "Content-Type": "image/png" } });
    // AWS returns 403; Garage 2.4.1 returns 400. The contract is "rejected with a client error".
    expect(isClientError(res.status)).toBe(true);
  });

  it("moves an object from quarantine to published (copy, then delete)", async () => {
    await s3.send(new PutObjectCommand({ Bucket: Bucket(), Key: "quarantine/move-me", Body: "bytes", ContentType: "image/png" }));
    await s3.send(new CopyObjectCommand({ Bucket: Bucket(), Key: "published/move-me", CopySource: `${Bucket()}/quarantine/move-me` }));
    await s3.send(new DeleteObjectCommand({ Bucket: Bucket(), Key: "quarantine/move-me" }));

    const published = await s3.send(new HeadObjectCommand({ Bucket: Bucket(), Key: "published/move-me" }));
    expect(published.ContentLength).toBe(5);
    await expect(s3.send(new HeadObjectCommand({ Bucket: Bucket(), Key: "quarantine/move-me" }))).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
  });

  it("stores a bucket CORS policy for browser uploads", async () => {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: Bucket(),
        CORSConfiguration: { CORSRules: [{ AllowedOrigins: ["http://localhost:3000"], AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 600 }] },
      }),
    );
    const cors = await s3.send(new GetBucketCorsCommand({ Bucket: Bucket() }));
    expect(cors.CORSRules?.[0]?.AllowedMethods).toEqual(expect.arrayContaining(["PUT", "GET"]));
  });

  it("records how SHA-256 checksum headers are handled (OI-41)", async () => {
    const good = Buffer.from("checksum good body");
    const sha = createHash("sha256").update(good).digest("base64");
    const put = (body: Buffer, key: string) =>
      s3.send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body, ChecksumSHA256: sha })).then(
        () => "accepted",
        (error: { $metadata?: { httpStatusCode?: number }; name?: string }) => `rejected ${error.$metadata?.httpStatusCode ?? "?"} ${error.name ?? ""}`.trim(),
      );
    const matching = await put(good, "quarantine/checksum-match");
    const mismatched = await put(Buffer.from("tampered body"), "quarantine/checksum-mismatch");
    console.info(`[OI-41] Garage x-amz-checksum-sha256: matching body ${matching}; mismatched body ${mismatched}`);
    expect(matching).toBe("accepted");
    // Either outcome is recorded; ADR-0007 requires the worker to verify SHA-256 regardless.
    expect(mismatched).toMatch(/^(accepted|rejected)/);
  });
});
