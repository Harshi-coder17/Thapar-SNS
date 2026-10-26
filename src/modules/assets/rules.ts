// Upload rules per purpose (OI-39) and file-signature detection (SPEC-W1). Pure, unit-tested.

export type AssetPurpose = "STUDY_MATERIAL" | "SOCIETY_LOGO" | "SOCIETY_BANNER" | "ARCHIVE_SCREENSHOT" | "FACULTY_PHOTO";
export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png";

const MB = 1024 * 1024;

/** Allowed types and maximum sizes per purpose (OI-39). */
export const PURPOSE_RULES: Record<AssetPurpose, { mimes: Partial<Record<AllowedMime, number>>; userUpload: boolean }> = {
  STUDY_MATERIAL: { mimes: { "application/pdf": 20 * MB, "image/jpeg": 5 * MB, "image/png": 5 * MB }, userUpload: true },
  SOCIETY_LOGO: { mimes: { "image/jpeg": 2 * MB, "image/png": 2 * MB }, userUpload: true },
  SOCIETY_BANNER: { mimes: { "image/jpeg": 5 * MB, "image/png": 5 * MB }, userUpload: true },
  ARCHIVE_SCREENSHOT: { mimes: { "image/jpeg": 5 * MB, "image/png": 5 * MB }, userUpload: true },
  // Imported by the system from official sources only.
  FACULTY_PHOTO: { mimes: { "image/jpeg": 2 * MB, "image/png": 2 * MB }, userUpload: false },
};

/** Per-user daily upload quota (OI-39). */
export const DAILY_UPLOAD_QUOTA = 20;
/** Signed PUT URL validity (OI-39). */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/** AWAITING_UPLOAD rows expire after this (OI-39, UC-13 E1). */
export const UPLOAD_EXPIRY_MS = 60 * 60 * 1000;
/** Signed download URL validity (OI-19). */
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/** The size limit for a declared type, or null when the type is not allowed for the purpose. */
export function maxSizeFor(purpose: AssetPurpose, mime: string): number | null {
  return PURPOSE_RULES[purpose].mimes[mime as AllowedMime] ?? null;
}

/** True MIME type from the file's first bytes (magic numbers), or null when unrecognised. */
export function detectMime(bytes: Uint8Array): AllowedMime | null {
  const starts = (sig: number[]) => sig.every((value, i) => bytes[i] === value);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

/** Lower-case hex SHA-256 (64 characters). */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

export const isImage = (mime: string) => mime === "image/jpeg" || mime === "image/png";

/** A file name safe to show and to use in Content-Disposition. */
export function cleanFileName(name: string): string {
  const base = name.replace(/[\\/]+/g, " ").replace(/[^\p{L}\p{N} ._()-]+/gu, "").trim().slice(0, 120);
  return base || "file";
}
