-- CreateEnum
CREATE TYPE "societies_member_role" AS ENUM ('HEAD', 'EDITOR', 'EVENT_MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "societies_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "societies_post_type" AS ENUM ('UPDATE', 'RECRUITMENT', 'STORY');

-- CreateEnum
CREATE TYPE "societies_post_visibility" AS ENUM ('PUBLIC', 'MEMBERS');

-- CreateTable
CREATE TABLE "societies_categories" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "societies_categories_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "societies_societies" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "socialLinks" JSONB NOT NULL DEFAULT '{}',
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "societies_societies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "societies_memberships" (
    "societyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "societies_member_role" NOT NULL,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "societies_memberships_pkey" PRIMARY KEY ("societyId","userId")
);

-- CreateTable
CREATE TABLE "societies_membership_requests" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "message" TEXT,
    "status" "societies_request_status" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "societies_membership_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "societies_follows" (
    "societyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "societies_follows_pkey" PRIMARY KEY ("societyId","userId")
);

-- CreateTable
CREATE TABLE "societies_posts" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "authorId" UUID,
    "type" "societies_post_type" NOT NULL,
    "visibility" "societies_post_visibility" NOT NULL DEFAULT 'PUBLIC',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "rolesSought" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eligibleYears" SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
    "eligibleBranchCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deadline" TIMESTAMPTZ(6),
    "applicationUrl" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "societies_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "societies_categories_label_key" ON "societies_categories"("label");

-- CreateIndex
CREATE UNIQUE INDEX "societies_societies_slug_key" ON "societies_societies"("slug");

-- CreateIndex
CREATE INDEX "societies_societies_categorySlug_idx" ON "societies_societies"("categorySlug");

-- CreateIndex
CREATE INDEX "societies_memberships_userId_idx" ON "societies_memberships"("userId");

-- CreateIndex
CREATE INDEX "societies_membership_requests_societyId_status_idx" ON "societies_membership_requests"("societyId", "status");

-- CreateIndex
CREATE INDEX "societies_membership_requests_userId_idx" ON "societies_membership_requests"("userId");

-- CreateIndex
CREATE INDEX "societies_follows_userId_idx" ON "societies_follows"("userId");

-- CreateIndex
CREATE INDEX "societies_posts_societyId_publishedAt_idx" ON "societies_posts"("societyId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "societies_posts_publishedAt_idx" ON "societies_posts"("publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "societies_societies" ADD CONSTRAINT "societies_societies_categorySlug_fkey" FOREIGN KEY ("categorySlug") REFERENCES "societies_categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_societies" ADD CONSTRAINT "societies_societies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_memberships" ADD CONSTRAINT "societies_memberships_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_memberships" ADD CONSTRAINT "societies_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_membership_requests" ADD CONSTRAINT "societies_membership_requests_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_membership_requests" ADD CONSTRAINT "societies_membership_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_membership_requests" ADD CONSTRAINT "societies_membership_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_follows" ADD CONSTRAINT "societies_follows_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_follows" ADD CONSTRAINT "societies_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_posts" ADD CONSTRAINT "societies_posts_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_posts" ADD CONSTRAINT "societies_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Rules Prisma cannot model (docs/database/database-design.md). Hand-written below this line.
-- ---------------------------------------------------------------------------------------------

-- Society names are unique ignoring case; slugs are lower-case URL names.
CREATE UNIQUE INDEX "societies_societies_name_lower_key" ON "societies_societies" (lower("name"));
ALTER TABLE "societies_societies"
  ADD CONSTRAINT "societies_societies_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 80),
  ADD CONSTRAINT "societies_societies_name_length" CHECK (char_length(btrim("name")) BETWEEN 3 AND 80),
  ADD CONSTRAINT "societies_societies_description_length" CHECK (char_length("description") BETWEEN 1 AND 2000);

-- FR-SOC-2 / OI-10: at most one Head per society.
CREATE UNIQUE INDEX "societies_memberships_one_head" ON "societies_memberships" ("societyId") WHERE "role" = 'HEAD';

-- OI-10: at most one pending membership request per student and society.
CREATE UNIQUE INDEX "societies_membership_requests_one_pending" ON "societies_membership_requests" ("societyId", "userId") WHERE "status" = 'PENDING';
ALTER TABLE "societies_membership_requests"
  ADD CONSTRAINT "societies_membership_requests_decision" CHECK (("status" IN ('PENDING', 'CANCELLED')) OR ("decidedAt" IS NOT NULL)),
  ADD CONSTRAINT "societies_membership_requests_message_length" CHECK ("message" IS NULL OR char_length("message") <= 500);

-- FR-SOC-3 / OI-11: stories are public, published at once and expire; recruitment posts name roles.
ALTER TABLE "societies_posts"
  ADD CONSTRAINT "societies_posts_story_rules" CHECK ("type" <> 'STORY' OR ("expiresAt" IS NOT NULL AND "publishedAt" IS NOT NULL AND "visibility" = 'PUBLIC')),
  ADD CONSTRAINT "societies_posts_expiry_only_stories" CHECK ("type" = 'STORY' OR "expiresAt" IS NULL),
  ADD CONSTRAINT "societies_posts_title_rules" CHECK (("type" = 'STORY' AND "title" IS NULL) OR ("type" <> 'STORY' AND char_length(btrim("title")) BETWEEN 3 AND 120)),
  ADD CONSTRAINT "societies_posts_recruitment_rules" CHECK (
    ("type" = 'RECRUITMENT' AND cardinality("rolesSought") BETWEEN 1 AND 10)
    OR ("type" <> 'RECRUITMENT' AND cardinality("rolesSought") = 0 AND cardinality("eligibleYears") = 0
        AND cardinality("eligibleBranchCodes") = 0 AND "deadline" IS NULL AND "applicationUrl" IS NULL)),
  ADD CONSTRAINT "societies_posts_years" CHECK ("eligibleYears" <@ ARRAY[1, 2, 3, 4, 5]::SMALLINT[]),
  ADD CONSTRAINT "societies_posts_application_url" CHECK ("applicationUrl" IS NULL OR "applicationUrl" ~ '^https://'),
  ADD CONSTRAINT "societies_posts_body_length" CHECK (char_length("body") BETWEEN 1 AND 20000);

-- Reference data: society categories ([PROPOSED] list; the owner can adjust it).
INSERT INTO "societies_categories" ("slug", "label", "sortOrder") VALUES
  ('technical', 'Technical', 0),
  ('cultural', 'Cultural', 10),
  ('literary', 'Literary', 20),
  ('music-dance', 'Music and Dance', 30),
  ('arts-media', 'Arts and Media', 40),
  ('sports-fitness', 'Sports and Fitness', 50),
  ('entrepreneurship', 'Entrepreneurship', 60),
  ('professional', 'Professional Chapters', 70),
  ('social-service', 'Social Service', 80);
