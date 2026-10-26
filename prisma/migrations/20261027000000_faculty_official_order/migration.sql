-- Faculty directory in official order (owner 2026-10-25). Additive only: two nullable columns and an index.

-- AlterTable
ALTER TABLE "faculty_profiles" ADD COLUMN     "listingOrder" INTEGER,
ADD COLUMN     "unitOrder" INTEGER;

-- CreateIndex
CREATE INDEX "faculty_profiles_unitOrder_listingOrder_idx" ON "faculty_profiles"("unitOrder", "listingOrder");

