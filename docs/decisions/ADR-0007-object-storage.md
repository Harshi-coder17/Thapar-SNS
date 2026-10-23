# ADR-0007: Object storage: Cloudflare R2 (production) + Garage (local); worker-side SHA-256

Status: **Proposed.**

## Context
- The spec specifies S3-compatible storage: MinIO locally, R2 or S3 in production.
- MinIO Community Edition has been in maintenance mode since Dec 2025 and its official images are no longer published. Third-party sources report the repository archived in 2026.
- Garage 2.4.1 (stable, 2026-09-08) documents presigned URLs, PutObject, CopyObject, HeadObject, DeleteObject and bucket CORS as implemented. Checksum headers are not documented.
- R2 supports presigned PUT (expiry up to 7 days) with Content-Type enforced in the signature. Content-MD5 is supported on PutObject. **SHA-256 checksum headers are not listed**, and CopyObject marks `x-amz-checksum-algorithm` as not implemented.

## Decision (proposed)
- R2 in staging/production; Garage in Docker for local development and integration tests.
- One storage adapter using the AWS SDK v3 S3 client.
- Upload intents sign Content-Type (and Content-Length where supported). The client's declared SHA-256 is stored.
- The **worker computes SHA-256** of the uploaded object and **rejects mismatches** before approval. This satisfies spec §6.1.3's "wrong checksum → rejection" at validation time rather than at upload time.
- Private buckets; quarantine and published prefixes; short-lived signed GET URLs for APPROVED assets only. Browser CORS limited to our origins.

## Findings from the Slice 1a storage contract test (2026-10-23, Garage 2.4.1)
- **The AWS SDK presigner signs only `host` by default.** Content-Type is enforced only when the presign call passes `signableHeaders: new Set(["content-type"])`. With that option, a PUT with a different Content-Type is rejected (403) and nothing is stored. The upload intent code in Slice 2d must use this option, and a test asserts `X-Amz-SignedHeaders=content-type;host`.
- Expired presigned URLs are rejected. Garage returns **400**; AWS documents 403. The contract is "rejected with a client error".
- Copy then delete (quarantine to published) and bucket CORS configuration work.
- Garage **verifies `x-amz-checksum-sha256`** on PutObject: a mismatched body is rejected with `400 InvalidDigest` (OI-41). R2 behaviour is still unverified, so the worker-side SHA-256 check stays mandatory.
- Garage 2.4.1 single-node mode (`--single-node --default-bucket`) creates the access key and bucket on first start. The image has no shell, so container readiness is detected from its log line.

## Consequences
- The checksum is not enforced by storage at upload time. A mismatched file is stored briefly in quarantine, then rejected and deleted.
- Storage contract tests run against Garage in CI. The same suite runs once against R2 at G-1c, to detect behavioural differences.
- R2 free-tier limits to be verified at G-1c.
