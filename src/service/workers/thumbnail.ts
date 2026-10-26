// Image thumbnails for approved uploads (OI-20). The image is decoded with a pixel limit (decompression
// bombs are refused), auto-rotated from EXIF, metadata stripped, and re-encoded as WebP.
import sharp from "sharp";

export const THUMBNAIL_SIZE = 480;

export async function makeThumbnail(image: Buffer): Promise<Buffer> {
  return sharp(image, { limitInputPixels: 40_000_000, failOn: "error" }).rotate().resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}
