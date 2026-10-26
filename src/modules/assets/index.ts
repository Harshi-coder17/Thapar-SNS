import "server-only";

// Public interface of the assets module (shared; Slices 2d/3a). Upload intents and completion
// (POST /api/uploads/intents, POST /api/uploads/{assetId}/complete, spec paths), signed downloads,
// and the worker and job functions the service calls.
import { apiDeps } from "@/modules/identity";
import { nudge } from "@/modules/outbox";
import { getDb } from "@/shared/db/client";
import { isUuid, RATE, runAction } from "@/shared/http/api-action";
import { getStorage } from "@/shared/storage/s3";

import type { AssetPurpose } from "./rules";
import * as service from "./service";

export type { AssetPurpose } from "./rules";
export { DAILY_UPLOAD_QUOTA, detectMime, maxSizeFor, PURPOSE_RULES } from "./rules";
export { publishedKey, quarantineKey, thumbnailKey } from "./service";

/** POST /api/uploads/intents */
export const handleUploadIntent = (request: Request) =>
  runAction(apiDeps(), request, {
    name: "assets:intent",
    rules: RATE.create,
    body: true,
    status: 201,
    run: (actor, body) => service.createUploadIntent(getDb(), getStorage(), actor.userId, body),
  });

/** POST /api/uploads/{assetId}/complete; nudges the service after the commit. */
export const handleUploadComplete = async (request: Request, assetId: string) => {
  const response = await runAction(apiDeps(), request, {
    name: "assets:complete",
    rules: RATE.write,
    ids: [assetId],
    run: (actor) => service.completeUpload(getDb(), getStorage(), actor.userId, assetId),
  });
  if (response.ok) await nudge();
  return response;
};

/**
 * Images any signed-in user may load by asset id. Study material and archive screenshots are served
 * only through their owning module's routes, which first check that the item is still visible.
 */
const PUBLIC_IMAGE_PURPOSES: readonly AssetPurpose[] = ["SOCIETY_LOGO", "SOCIETY_BANNER", "FACULTY_PHOTO"];

/**
 * GET /api/assets/{assetId}/file?variant=thumbnail&download=1: signed-in users get a 302 to a
 * 5-minute signed URL for an APPROVED asset; anything else is 404 (never reveals pending files).
 */
export async function handleAssetFile(request: Request, assetId: string, purposes: readonly AssetPurpose[] = PUBLIC_IMAGE_PURPOSES): Promise<Response> {
  const deps = apiDeps();
  const session = await deps.readSession(request.headers).catch(() => null);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!isUuid(assetId)) return new Response("Not Found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const url = await service.downloadUrl(getDb(), getStorage(), assetId, params.get("variant") === "thumbnail" ? "thumbnail" : "original", params.get("download") === "1", purposes);
  if (!url) return new Response("Not Found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=240" } });
}

/** Status of the caller's own upload (polled by upload forms). */
export async function ownUploadStatus(userId: string, assetId: string) {
  const asset = await getDb().asset.findUnique({ where: { id: assetId }, select: { ownerId: true, status: true, rejectionReason: true } });
  return asset && asset.ownerId === userId ? { status: asset.status, rejectionReason: asset.rejectionReason } : null;
}

/** An APPROVED asset's URL path for <img> (served through handleAssetFile), or null. */
export const assetPath = (assetId: string | null | undefined, variant: "original" | "thumbnail" = "thumbnail") =>
  assetId ? `/api/assets/${assetId}/file${variant === "thumbnail" ? "?variant=thumbnail" : ""}` : null;

/** For other modules: check that the actor uploaded `assetId` for `purpose` and it can be attached. */
export const ownedAssetFor = (ownerId: string, assetId: string, purpose: AssetPurpose) => service.ownedAssetFor(getDb(), ownerId, assetId, purpose);

/** Statuses of several assets (other modules list only APPROVED ones). */
export async function assetStatuses(ids: string[]): Promise<Map<string, { status: string; hasThumbnail: boolean; mime: string | null; size: number | null; rejectionReason: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb().asset.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, thumbnailKey: true, detectedMime: true, actualSize: true, declaredMime: true, declaredSize: true, rejectionReason: true } });
  return new Map(rows.map((r) => [r.id, { status: r.status, hasThumbnail: r.thumbnailKey !== null, mime: r.detectedMime ?? r.declaredMime, size: r.actualSize ?? r.declaredSize, rejectionReason: r.rejectionReason }]));
}

// Service entry points (src/service/workers).
export const processUploadedAsset = (assetId: string, makeThumbnail?: (image: Buffer) => Promise<Buffer>) => service.processUploadedAsset(getDb(), getStorage(), assetId, makeThumbnail);
export const expireStaleUploads = (now?: Date) => service.expireStaleUploads(getDb(), getStorage(), now);
export const importSystemAsset = (input: Parameters<typeof service.importSystemAsset>[2]) => service.importSystemAsset(getDb(), getStorage(), input);
/** Configures bucket CORS so browsers on the app origin may PUT to signed URLs (local setup). */
export const configureStorageCors = (origins: string[]) => getStorage().configureCors(origins);
