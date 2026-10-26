-- ADR-0013 (owner decisions 2026-10-25, OI-56): equal Heads with explicit Head grants, display-only
-- membership groups and titles, optional category and description, longer names, provenance,
-- faculty associations, and on-behalf-of audit attribution.
--
-- Data-preserving order: new types, columns and tables first; then existing data is copied into
-- them; only then is the old `role` column dropped. No society, membership, post, follow, request,
-- user, session or audit row is deleted. Hand-written: Prisma's generated diff would drop `role`
-- before its data could be copied.

-- 1. New types ---------------------------------------------------------------------------------
CREATE TYPE "societies_member_group" AS ENUM ('CORE', 'GENERAL');
CREATE TYPE "societies_head_grant_reason" AS ENUM ('MIGRATED', 'CREATED_WITH_SOCIETY', 'ADDED', 'HANDOVER', 'ADMIN_RECOVERY');
CREATE TYPE "societies_head_revoke_reason" AS ENUM ('REMOVED', 'HANDOVER');

-- 2. Audit attribution (additive; the append-only trigger only blocks UPDATE/DELETE/TRUNCATE of rows)
ALTER TABLE "admin_audit_logs" ADD COLUMN "onBehalfOfId" UUID,
ADD COLUMN "onBehalfOfType" TEXT;
CREATE INDEX "admin_audit_logs_onBehalfOfType_onBehalfOfId_idx" ON "admin_audit_logs"("onBehalfOfType", "onBehalfOfId");

-- 3. Societies: optional category and description, longer names, provenance --------------------
ALTER TABLE "societies_societies" ADD COLUMN "shortName" TEXT,
ADD COLUMN "sourceFetchedAt" TIMESTAMPTZ(6),
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMPTZ(6),
ADD COLUMN "verifiedById" UUID,
ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "categorySlug" DROP NOT NULL;
CREATE UNIQUE INDEX "societies_societies_sourceKey_key" ON "societies_societies"("sourceKey");
ALTER TABLE "societies_societies" ADD CONSTRAINT "societies_societies_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "societies_societies" DROP CONSTRAINT "societies_societies_name_length",
  ADD CONSTRAINT "societies_societies_name_length" CHECK (char_length(btrim("name")) BETWEEN 3 AND 150);
ALTER TABLE "societies_societies" DROP CONSTRAINT "societies_societies_description_length",
  ADD CONSTRAINT "societies_societies_description_length" CHECK ("description" IS NULL OR char_length("description") BETWEEN 1 AND 4000);
ALTER TABLE "societies_societies"
  ADD CONSTRAINT "societies_societies_short_name_length" CHECK ("shortName" IS NULL OR char_length(btrim("shortName")) BETWEEN 1 AND 30),
  ADD CONSTRAINT "societies_societies_source_url" CHECK ("sourceUrl" IS NULL OR "sourceUrl" ~ '^https://');

-- Societies created by an admin before this migration were reviewed when they were created.
UPDATE "societies_societies" SET "verifiedAt" = "createdAt", "verifiedById" = "createdById" WHERE "verifiedAt" IS NULL;

-- 4. Head grants: the only source of management access ------------------------------------------
CREATE TABLE "societies_head_grants" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" UUID,
    "grantReason" "societies_head_grant_reason" NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedById" UUID,
    "revokeReason" "societies_head_revoke_reason",

    CONSTRAINT "societies_head_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "societies_head_grants_revocation" CHECK (("revokedAt" IS NULL AND "revokeReason" IS NULL) OR ("revokedAt" IS NOT NULL AND "revokeReason" IS NOT NULL))
);
CREATE INDEX "societies_head_grants_societyId_idx" ON "societies_head_grants"("societyId");
CREATE INDEX "societies_head_grants_userId_idx" ON "societies_head_grants"("userId");
-- One active grant per society and user; revoked grants stay as history.
CREATE UNIQUE INDEX "societies_head_grants_one_active" ON "societies_head_grants"("societyId", "userId") WHERE "revokedAt" IS NULL;
ALTER TABLE "societies_head_grants" ADD CONSTRAINT "societies_head_grants_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "societies_head_grants" ADD CONSTRAINT "societies_head_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "societies_head_grants" ADD CONSTRAINT "societies_head_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "societies_head_grants" ADD CONSTRAINT "societies_head_grants_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Memberships: display group and title instead of permission tiers ---------------------------
ALTER TABLE "societies_memberships" ADD COLUMN "group" "societies_member_group" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "position" TEXT;
ALTER TABLE "societies_memberships" ADD CONSTRAINT "societies_memberships_position_length" CHECK ("position" IS NULL OR char_length(btrim("position")) BETWEEN 1 AND 60);

-- Copy existing data before the old column goes:
--   HEAD          -> an active Head grant (MIGRATED) + display group CORE
--   EDITOR        -> display group CORE, title "Editor"        (no management access)
--   EVENT_MANAGER -> display group CORE, title "Event Manager" (no management access)
--   MEMBER        -> display group GENERAL
INSERT INTO "societies_head_grants" ("id", "societyId", "userId", "grantedAt", "grantedById", "grantReason")
SELECT gen_random_uuid(), m."societyId", m."userId", m."joinedAt", s."createdById", 'MIGRATED'
FROM "societies_memberships" m JOIN "societies_societies" s ON s."id" = m."societyId"
WHERE m."role" = 'HEAD';
UPDATE "societies_memberships" SET "group" = 'CORE' WHERE "role" = 'HEAD';
UPDATE "societies_memberships" SET "group" = 'CORE', "position" = 'Editor' WHERE "role" = 'EDITOR';
UPDATE "societies_memberships" SET "group" = 'CORE', "position" = 'Event Manager' WHERE "role" = 'EVENT_MANAGER';
UPDATE "societies_memberships" SET "group" = 'GENERAL' WHERE "role" = 'MEMBER';

-- Safety check: every former HEAD row now has an active grant. Aborts the migration otherwise.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "societies_memberships" m
    WHERE m."role" = 'HEAD' AND NOT EXISTS (
      SELECT 1 FROM "societies_head_grants" g WHERE g."societyId" = m."societyId" AND g."userId" = m."userId" AND g."revokedAt" IS NULL)
  ) THEN
    RAISE EXCEPTION 'ADR-0013 migration: a HEAD membership was not converted into a Head grant';
  END IF;
END $$;

-- Now the old tiers can go (this also drops the one-Head index, which depended on the column).
DROP INDEX IF EXISTS "societies_memberships_one_head";
ALTER TABLE "societies_memberships" DROP COLUMN "role";
DROP TYPE "societies_member_role";

-- 6. Faculty associations (unverified until reviewed; admin-visible only) -----------------------
CREATE TABLE "societies_faculty_associations" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "email" TEXT,
    "sourceRole" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMPTZ(6),
    "verifiedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "societies_faculty_associations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "societies_faculty_associations_societyId_idx" ON "societies_faculty_associations"("societyId");
ALTER TABLE "societies_faculty_associations" ADD CONSTRAINT "societies_faculty_associations_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "societies_faculty_associations" ADD CONSTRAINT "societies_faculty_associations_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
