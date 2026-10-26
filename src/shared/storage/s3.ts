import "server-only";

// Object storage adapter (ADR-0007): one S3 client for Garage (local) and R2 (later). Private bucket;
// browsers upload with short-lived signed PUT URLs to the quarantine prefix and download APPROVED
// files with short-lived signed GET URLs. File bytes never pass through the web app.
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { parseServerEnv } from "@/shared/env";

export interface Storage {
  bucket: string;
  /** The storage origin, for the Content-Security-Policy (connect-src, img-src). */
  origin: string;
  signedPutUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  signedGetUrl(key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  read(key: string, maxBytes: number): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  remove(key: string): Promise<void>;
  configureCors(origins: string[]): Promise<void>;
}

export function createStorage(config: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Only send checksums when an operation requires them (Garage/R2 compatibility).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;
  const isMissing = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
  return {
    bucket: Bucket,
    origin: new URL(config.endpoint).origin,
    // Content-Type is signed (ADR-0007 finding): a PUT with another type is rejected by storage.
    signedPutUrl: (key, contentType, expiresIn) =>
      getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn, signableHeaders: new Set(["content-type"]) }),
    signedGetUrl: (key, expiresIn, downloadName) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(downloadName ? { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/[^\w.\- ]+/g, "_")}"` } : {}),
        }),
        { expiresIn },
      ),
    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async read(key, maxBytes) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > maxBytes) throw new Error("object larger than allowed");
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async copy(fromKey, toKey) {
      await client.send(new CopyObjectCommand({ Bucket, Key: toKey, CopySource: `${Bucket}/${fromKey}` }));
    },
    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    },
    async configureCors(origins) {
      await client.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 600 }] },
        }),
      );
    },
  };
}

const globalForStorage = globalThis as typeof globalThis & { thaparSnsStorage?: Storage };

/** The process-wide storage client, configured from the environment on first use. */
export function getStorage(): Storage {
  if (!globalForStorage.thaparSnsStorage) {
    const env = parseServerEnv(process.env);
    globalForStorage.thaparSnsStorage = createStorage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }
  return globalForStorage.thaparSnsStorage;
}

/** The storage origin for the CSP, or null when storage is not configured (pages still render). */
export function storageOrigin(): string | null {
  const endpoint = process.env.S3_ENDPOINT;
  try {
    return endpoint ? new URL(endpoint).origin : null;
  } catch {
    return null;
  }
}
