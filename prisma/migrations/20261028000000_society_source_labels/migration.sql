-- Official source labels for societies (OI-55, owner 2026-10-26). Additive only: two nullable columns.

-- AlterTable
ALTER TABLE "societies_societies" ADD COLUMN     "sourceSubtype" TEXT,
ADD COLUMN     "sourceType" TEXT;

