import "server-only";

// Asset pipeline (UC-13 steps 4 to 9, SPEC-ASSET, ADR-0007, OI-18, OI-39). Forward-only state machine:
// AWAITING_UPLOAD -> UPLOADED -> SCANNING -> APPROVED | REJECTED | QUARANTINED; AWAITING_UPLOAD -> EXPIRED.
// Every transition is a state-conditional update, so re-running a step never moves an asset backwards
// and duplicate outbox deliveries have a single effect.
import { createHash } from "node:crypto";

import { enqueue } from "@/modules/outbox";
import { notify } from "@/modules/notifications";
import { conflict, forbidden, invalid, invalidState, notFound, ok, type ServiceResult } from "@/shared/http/api-action";
import type { PrismaClient } from "@/shared/db/client";
import type { Storage } from "@/shared/storage/s3";

import {
  type AssetPurpose,
  cleanFileName,
  DAILY_UPLOAD_QUOTA,
  detectMime,
  DOWNLOAD_URL_TTL_SECONDS,
  isImage,
  maxSizeFor,
  PURPOSE_RULES,
  SHA256_HEX,
  UPLOAD_EXPIRY_MS,
  UPLOAD_URL_TTL_SECONDS,
} from "./rules";

export const quarantineKey = (id: string) => `quarantine/${id}`;
export const publishedKey = (id: string) => `published/${id}`;
export const thumbnailKey = (id: string) => `thumbs/${id}.webp`;

export interface UploadIntentInput {
  purpose: AssetPurpose;
  fileName: string;
  contentType: string;
  size: number;
  /** Lower-case hex SHA-256 of the file, computed by the browser. */
  sha256: string;
}

/**
 * UC-13 step 4: an upload intent. Type and size are checked BEFORE a signed URL is issued (E3); the
 * daily quota limits abuse. The PUT URL signs the Content-Type, so storage rejects another type.
 */
export async function createUploadIntent(
  prisma: PrismaClient,
  storage: Storage,
  ownerId: string,
  raw: unknown,
  now = new Date(),
): Promise<ServiceResult<{ assetId: string; uploadUrl: string; contentType: string; expiresAt: Date }>> {
  const input = raw as Partial<UploadIntentInput>;
  const fields: Record<string, string> = {};
  const purpose = input.purpose;
  if (!purpose || !(purpose in PURPOSE_RULES) || !PURPOSE_RULES[purpose].userUpload) fields.purpose = "Unknown upload purpose.";
  if (typeof input.fileName !== "string" || input.fileName.trim() === "") fields.fileName = "Choose a file.";
  if (typeof input.sha256 !== "string" || !SHA256_HEX.test(input.sha256)) fields.sha256 = "The file checksum is missing.";
  if (typeof input.size !== "number" || !Number.isInteger(input.size) || input.size <= 0) fields.size = "The file is empty.";
  if (Object.keys(fields).length > 0 || !purpose) return invalid(fields);
  const limit = maxSizeFor(purpose, String(input.contentType));
  if (limit === null) return invalid({ file: `This file type is not allowed. Allowed: ${Object.keys(PURPOSE_RULES[purpose].mimes).join(", ")}.` });
  if ((input.size as number) > limit) return { ok: false, code: "TOO_LARGE", message: `The file is larger than ${Math.round(limit / 1024 / 1024)} MB.` };

  const since = new Date(now.getTime() - 86_400_000);
  if ((await prisma.asset.count({ where: { ownerId, createdAt: { gte: since } } })) >= DAILY_UPLOAD_QUOTA) {
    return { ok: false, code: "RATE_LIMITED", message: `You can upload at most ${DAILY_UPLOAD_QUOTA} files per day.` };
  }
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + UPLOAD_EXPIRY_MS);
  await prisma.asset.create({
    data: {
      id,
      ownerId,
      purpose,
      originalName: cleanFileName(input.fileName as string),
      declaredMime: input.contentType as string,
      declaredSize: input.size as number,
      sha256Declared: input.sha256 as string,
      quarantineKey: quarantineKey(id),
      expiresAt,
    },
  });
  const uploadUrl = await storage.signedPutUrl(quarantineKey(id), input.contentType as string, UPLOAD_URL_TTL_SECONDS);
  return ok({ assetId: id, uploadUrl, contentType: input.contentType as string, expiresAt });
}

/**
 * UC-13 steps 6 and 7: the client says the upload finished. The status change and the
 * `file.uploaded` outbox row are written in ONE transaction; the dedupe key makes a repeated call a
 * no-op. The caller nudges the service after commit.
 */
export async function completeUpload(prisma: PrismaClient, storage: Storage, ownerId: string, assetId: string, now = new Date()): Promise<ServiceResult<{ status: string }>> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { ownerId: true, status: true, expiresAt: true, quarantineKey: true } });
  if (!asset || asset.ownerId !== ownerId) return notFound;
  if (asset.status !== "AWAITING_UPLOAD") return ok({ status: asset.status });
  if (asset.expiresAt <= now) return invalidState("This upload expired. Start again.");
  if (!(await storage.head(asset.quarantineKey))) return conflict("The file has not been uploaded yet.");
  await prisma.$transaction(async (tx) => {
    const moved = await tx.asset.updateMany({ where: { id: assetId, status: "AWAITING_UPLOAD" }, data: { status: "UPLOADED" } });
    if (moved.count === 1) await enqueue(tx, { type: "file.uploaded", payload: { assetId }, dedupeKey: `file.uploaded:${assetId}` });
  });
  return ok({ status: "UPLOADED" });
}

/** Where to send the owner after a decision, by purpose. */
const hrefFor = (purpose: AssetPurpose) => (purpose === "STUDY_MATERIAL" ? "/materials?view=mine" : purpose === "ARCHIVE_SCREENSHOT" ? "/archive?view=mine" : "/societies");

/**
 * Worker 1 (UC-13 steps 8 and 9, SPEC-W1): validates the quarantined file (true MIME by magic bytes,
 * declared vs detected type, size limit, SHA-256), makes a thumbnail for images, copies valid files to
 * the published prefix and deletes the quarantine copy only after the status commit. Deterministic
 * validation failures are REJECTED with a reason (a successful run); infrastructure errors throw so the
 * outbox retries.
 */
export async function processUploadedAsset(prisma: PrismaClient, storage: Storage, assetId: string, makeThumbnail?: (image: Buffer) => Promise<Buffer>, now = new Date()): Promise<"approved" | "rejected" | "skipped"> {
  const claimed = await prisma.asset.updateMany({ where: { id: assetId, status: { in: ["UPLOADED", "SCANNING"] } }, data: { status: "SCANNING" } });
  if (claimed.count === 0) return "skipped";
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  const limit = maxSizeFor(asset.purpose, asset.declaredMime) ?? 0;

  const head = await storage.head(asset.quarantineKey);
  let reason: string | null = null;
  let bytes: Buffer | null = null;
  if (!head) reason = "The uploaded file could not be found.";
  else if (head.size > limit) reason = "The file is larger than allowed.";
  else {
    bytes = await storage.read(asset.quarantineKey, limit);
    const detected = detectMime(bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (!detected) reason = "The file content is not a PDF, JPEG or PNG.";
    else if (detected !== asset.declaredMime) reason = `The file content (${detected}) does not match its declared type (${asset.declaredMime}).`;
    else if (maxSizeFor(asset.purpose, detected) === null) reason = "This file type is not allowed here.";
    else if (sha !== asset.sha256Declared) reason = "The file checksum does not match (the upload was altered or incomplete).";
    await prisma.asset.update({ where: { id: assetId }, data: { detectedMime: detected, actualSize: bytes.length, sha256Actual: sha } });
  }

  let thumb: Buffer | null = null;
  if (!reason && bytes && isImage(asset.declaredMime) && makeThumbnail) {
    try {
      thumb = await makeThumbnail(bytes);
    } catch {
      reason = "The image could not be decoded.";
    }
  }

  if (reason) {
    await prisma.$transaction(async (tx) => {
      const done = await tx.asset.updateMany({ where: { id: assetId, status: "SCANNING" }, data: { status: "REJECTED", rejectionReason: reason } });
      if (done.count === 1 && asset.ownerId) {
        await notify(tx, { recipients: [asset.ownerId], type: "upload.rejected", payload: { name: asset.originalName, reason, href: hrefFor(asset.purpose) }, sourceKey: `asset:${assetId}:rejected` });
      }
    });
    await storage.remove(asset.quarantineKey); // OI-18: rejected objects are deleted
    return "rejected";
  }

  // Idempotent storage steps: deterministic keys; a re-run overwrites with the same bytes.
  await storage.copy(asset.quarantineKey, publishedKey(assetId));
  if (thumb) await storage.put(thumbnailKey(assetId), thumb, "image/webp");
  await prisma.$transaction(async (tx) => {
    const done = await tx.asset.updateMany({
      where: { id: assetId, status: "SCANNING" },
      data: { status: "APPROVED", publishedKey: publishedKey(assetId), thumbnailKey: thumb ? thumbnailKey(assetId) : null, approvedAt: now },
    });
    // Society logos, banners and faculty photos do not notify; materials and screenshots do.
    if (done.count === 1 && asset.ownerId && (asset.purpose === "STUDY_MATERIAL" || asset.purpose === "ARCHIVE_SCREENSHOT")) {
      await notify(tx, { recipients: [asset.ownerId], type: "upload.approved", payload: { name: asset.originalName, reason: null, href: hrefFor(asset.purpose) }, sourceKey: `asset:${assetId}:approved` });
    }
  });
  await storage.remove(asset.quarantineKey);
  return "approved";
}

/** Signed, short-lived download URL for an APPROVED asset (OI-19). Anything else is "not found". */
export async function downloadUrl(prisma: PrismaClient, storage: Storage, assetId: string, variant: "original" | "thumbnail" = "original", asAttachment = false, purposes?: readonly AssetPurpose[]): Promise<string | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { status: true, publishedKey: true, thumbnailKey: true, originalName: true, purpose: true } });
  if (!asset || asset.status !== "APPROVED" || !asset.publishedKey) return null;
  if (purposes && !purposes.includes(asset.purpose)) return null;
  const key = variant === "thumbnail" && asset.thumbnailKey ? asset.thumbnailKey : asset.publishedKey;
  return storage.signedGetUrl(key, DOWNLOAD_URL_TTL_SECONDS, asAttachment ? asset.originalName : undefined);
}

/** Scheduled job (UC-13 E1): AWAITING_UPLOAD past its expiry -> EXPIRED, quarantine object deleted. */
export async function expireStaleUploads(prisma: PrismaClient, storage: Storage, now = new Date()): Promise<number> {
  const stale = await prisma.asset.findMany({ where: { status: "AWAITING_UPLOAD", expiresAt: { lte: now } }, select: { id: true, quarantineKey: true }, take: 500 });
  let expired = 0;
  for (const asset of stale) {
    const { count } = await prisma.asset.updateMany({ where: { id: asset.id, status: "AWAITING_UPLOAD" }, data: { status: "EXPIRED" } });
    if (count === 1) {
      expired += 1;
      await storage.remove(asset.quarantineKey);
    }
  }
  return expired;
}

/**
 * System import of an official file (society logo, faculty photo): the bytes go to quarantine and
 * through exactly the same validation as a user upload. Idempotent per sourceUrl + purpose.
 */
export async function importSystemAsset(
  prisma: PrismaClient,
  storage: Storage,
  input: { purpose: AssetPurpose; fileName: string; bytes: Buffer; sourceUrl: string },
  now = new Date(),
): Promise<{ assetId: string; created: boolean } | { error: string }> {
  const existing = await prisma.asset.findFirst({ where: { sourceUrl: input.sourceUrl, purpose: input.purpose, status: { notIn: ["REJECTED", "EXPIRED"] } }, select: { id: true } });
  if (existing) return { assetId: existing.id, created: false };
  const detected = detectMime(input.bytes);
  if (!detected || maxSizeFor(input.purpose, detected) === null) return { error: "unsupported file type" };
  if (input.bytes.length > (maxSizeFor(input.purpose, detected) ?? 0)) return { error: "file too large" };
  const id = crypto.randomUUID();
  await storage.put(quarantineKey(id), input.bytes, detected);
  await prisma.$transaction(async (tx) => {
    await tx.asset.create({
      data: {
        id,
        ownerId: null,
        purpose: input.purpose,
        originalName: cleanFileName(input.fileName),
        declaredMime: detected,
        declaredSize: input.bytes.length,
        sha256Declared: createHash("sha256").update(input.bytes).digest("hex"),
        quarantineKey: quarantineKey(id),
        status: "UPLOADED",
        sourceUrl: input.sourceUrl,
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    await enqueue(tx, { type: "file.uploaded", payload: { assetId: id }, dedupeKey: `file.uploaded:${id}` });
  });
  return { assetId: id, created: true };
}

/** An asset the actor uploaded for `purpose` and that is not rejected or expired (for attaching). */
export async function ownedAssetFor(prisma: PrismaClient, ownerId: string, assetId: string, purpose: AssetPurpose): Promise<ServiceResult<{ id: string }>> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { ownerId: true, purpose: true, status: true } });
  if (!asset || asset.ownerId !== ownerId) return notFound;
  if (asset.purpose !== purpose) return forbidden;
  if (["REJECTED", "EXPIRED", "QUARANTINED", "AWAITING_UPLOAD"].includes(asset.status)) return invalidState("Upload the file first; rejected or expired files cannot be used.");
  return ok({ id: assetId });
}
