-- Platform modules (Slices 2b, 2c, 2d, 3a, 4a to 4e, 5): assets, outbox, notifications, events, find
-- mates and chat, study material, archive, faculty, calendar, placement, moderation. Additive only:
-- no existing table, column or row is changed or removed.

-- CreateEnum
CREATE TYPE "assets_status" AS ENUM ('AWAITING_UPLOAD', 'UPLOADED', 'SCANNING', 'APPROVED', 'QUARANTINED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "assets_purpose" AS ENUM ('STUDY_MATERIAL', 'SOCIETY_LOGO', 'SOCIETY_BANNER', 'ARCHIVE_SCREENSHOT', 'FACULTY_PHOTO');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'DEAD');

-- CreateEnum
CREATE TYPE "events_status" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "events_registration_status" AS ENUM ('REGISTERED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "findmates_type" AS ENUM ('HACKATHON', 'PROJECT', 'CASUAL');

-- CreateEnum
CREATE TYPE "findmates_request_status" AS ENUM ('OPEN', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "findmates_response_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "studymaterial_type" AS ENUM ('NOTES', 'PYQ', 'REFERENCE');

-- CreateEnum
CREATE TYPE "archive_status" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "faculty_claim_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "calendar_layer" AS ENUM ('ACADEMIC', 'CAMPUS', 'SOCIETY', 'PERSONAL');

-- CreateEnum
CREATE TYPE "placement_offer_type" AS ENUM ('FULL_TIME', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "admin_report_target" AS ENUM ('SOCIETY_POST', 'STUDY_MATERIAL', 'ARCHIVE_PROJECT', 'ARCHIVE_COMMENT', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "admin_report_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "identity_users" ADD COLUMN     "bannedAt" TIMESTAMPTZ(6),
ADD COLUMN     "bannedReason" TEXT;

-- AlterTable
ALTER TABLE "societies_faculty_associations" ADD COLUMN     "facultyProfileId" UUID,
ADD COLUMN     "matchBasis" TEXT;

-- AlterTable
ALTER TABLE "societies_societies" ADD COLUMN     "bannerAssetId" UUID,
ADD COLUMN     "logoAssetId" UUID,
ADD COLUMN     "logoSourceUrl" TEXT;

-- CreateTable
CREATE TABLE "assets_assets" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "purpose" "assets_purpose" NOT NULL,
    "originalName" TEXT NOT NULL,
    "declaredMime" TEXT NOT NULL,
    "detectedMime" TEXT,
    "declaredSize" INTEGER NOT NULL,
    "actualSize" INTEGER,
    "sha256Declared" TEXT NOT NULL,
    "sha256Actual" TEXT,
    "quarantineKey" TEXT NOT NULL,
    "publishedKey" TEXT,
    "thumbnailKey" TEXT,
    "status" "assets_status" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "rejectionReason" TEXT,
    "sourceUrl" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assets_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_notifications" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "sourceKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events_events" (
    "id" UUID NOT NULL,
    "societyId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "events_status" NOT NULL DEFAULT 'DRAFT',
    "registrationSchema" JSONB NOT NULL DEFAULT '[]',
    "registeredCount" INTEGER NOT NULL DEFAULT 0,
    "interestCount" INTEGER NOT NULL DEFAULT 0,
    "interestVersion" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "publishedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events_interests" (
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_interests_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "events_registrations" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "events_registration_status" NOT NULL,
    "responses" JSONB NOT NULL DEFAULT '{}',
    "queuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findmates_requests" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "findmates_type" NOT NULL,
    "subject" TEXT,
    "teamSize" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 1,
    "status" "findmates_request_status" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "firstAcceptedAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "findmates_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findmates_request_skills" (
    "requestId" UUID NOT NULL,
    "tagSlug" TEXT NOT NULL,

    CONSTRAINT "findmates_request_skills_pkey" PRIMARY KEY ("requestId","tagSlug")
);

-- CreateTable
CREATE TABLE "findmates_responses" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "responderId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "findmates_response_status" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findmates_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findmates_connections" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "responseId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "responderId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findmates_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findmates_chat_messages" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "senderId" UUID,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "findmates_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studymaterial_materials" (
    "id" UUID NOT NULL,
    "uploaderId" UUID,
    "assetId" UUID NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "studymaterial_type" NOT NULL,
    "semester" SMALLINT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "hiddenAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "studymaterial_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studymaterial_votes" (
    "materialId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studymaterial_votes_pkey" PRIMARY KEY ("materialId","userId")
);

-- CreateTable
CREATE TABLE "archive_projects" (
    "id" UUID NOT NULL,
    "submitterId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "status" "archive_status" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" UUID,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "archive_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_project_tags" (
    "projectId" UUID NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "archive_project_tags_pkey" PRIMARY KEY ("projectId","tag")
);

-- CreateTable
CREATE TABLE "archive_screenshots" (
    "projectId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "archive_screenshots_pkey" PRIMARY KEY ("projectId","position")
);

-- CreateTable
CREATE TABLE "archive_votes" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_votes_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "archive_comments" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID,
    "parentId" UUID,
    "depth" SMALLINT NOT NULL,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "email" TEXT,
    "cabin" TEXT,
    "specialization" TEXT,
    "officeHours" TEXT,
    "photoAssetId" UUID,
    "photoSourceUrl" TEXT,
    "profileUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMPTZ(6),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faculty_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_claims" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "claimantId" UUID NOT NULL,
    "status" "faculty_claim_status" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decidedById" UUID,
    "reason" TEXT,
    "decidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faculty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_entries" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "layer" "calendar_layer" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "rrule" TEXT,
    "ruleVersion" INTEGER NOT NULL DEFAULT 0,
    "expandedTo" TIMESTAMPTZ(6),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_occurrences" (
    "entryId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_occurrences_pkey" PRIMARY KEY ("entryId","startsAt")
);

-- CreateTable
CREATE TABLE "placement_records" (
    "id" UUID NOT NULL,
    "academicYear" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "offerType" "placement_offer_type" NOT NULL,
    "offerCount" INTEGER NOT NULL,
    "eligibleCount" INTEGER,
    "placedCount" INTEGER,
    "medianCtcLpa" DECIMAL(6,2),
    "ctcBand" TEXT,
    "sourceCitation" TEXT NOT NULL,
    "sourceDate" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "placement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_moderation_reports" (
    "id" UUID NOT NULL,
    "targetType" "admin_report_target" NOT NULL,
    "targetId" UUID NOT NULL,
    "reporterId" UUID,
    "reason" TEXT NOT NULL,
    "status" "admin_report_status" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolution" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),

    CONSTRAINT "admin_moderation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_assets_quarantineKey_key" ON "assets_assets"("quarantineKey");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assets_publishedKey_key" ON "assets_assets"("publishedKey");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assets_thumbnailKey_key" ON "assets_assets"("thumbnailKey");

-- CreateIndex
CREATE INDEX "assets_assets_ownerId_createdAt_idx" ON "assets_assets"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "assets_assets_status_expiresAt_idx" ON "assets_assets"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "notifications_notifications_recipientId_createdAt_idx" ON "notifications_notifications"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_notifications_sourceKey_recipientId_key" ON "notifications_notifications"("sourceKey", "recipientId");

-- CreateIndex
CREATE INDEX "events_events_status_startAt_idx" ON "events_events"("status", "startAt");

-- CreateIndex
CREATE INDEX "events_events_societyId_startAt_idx" ON "events_events"("societyId", "startAt");

-- CreateIndex
CREATE INDEX "events_interests_userId_idx" ON "events_interests"("userId");

-- CreateIndex
CREATE INDEX "events_registrations_eventId_status_queuedAt_idx" ON "events_registrations"("eventId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "events_registrations_userId_idx" ON "events_registrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "events_registrations_eventId_userId_key" ON "events_registrations"("eventId", "userId");

-- CreateIndex
CREATE INDEX "findmates_requests_status_expiresAt_idx" ON "findmates_requests"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "findmates_requests_creatorId_idx" ON "findmates_requests"("creatorId");

-- CreateIndex
CREATE INDEX "findmates_request_skills_tagSlug_idx" ON "findmates_request_skills"("tagSlug");

-- CreateIndex
CREATE UNIQUE INDEX "findmates_responses_requestId_responderId_key" ON "findmates_responses"("requestId", "responderId");

-- CreateIndex
CREATE UNIQUE INDEX "findmates_connections_responseId_key" ON "findmates_connections"("responseId");

-- CreateIndex
CREATE INDEX "findmates_connections_requesterId_idx" ON "findmates_connections"("requesterId");

-- CreateIndex
CREATE INDEX "findmates_connections_responderId_idx" ON "findmates_connections"("responderId");

-- CreateIndex
CREATE INDEX "findmates_chat_messages_connectionId_createdAt_idx" ON "findmates_chat_messages"("connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "studymaterial_materials_assetId_key" ON "studymaterial_materials"("assetId");

-- CreateIndex
CREATE INDEX "studymaterial_materials_subjectCode_semester_idx" ON "studymaterial_materials"("subjectCode", "semester");

-- CreateIndex
CREATE INDEX "archive_projects_status_createdAt_idx" ON "archive_projects"("status", "createdAt");

-- CreateIndex
CREATE INDEX "archive_project_tags_tag_idx" ON "archive_project_tags"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "archive_screenshots_assetId_key" ON "archive_screenshots"("assetId");

-- CreateIndex
CREATE INDEX "archive_comments_projectId_createdAt_idx" ON "archive_comments"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_profiles_userId_key" ON "faculty_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_profiles_photoAssetId_key" ON "faculty_profiles"("photoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_profiles_sourceKey_key" ON "faculty_profiles"("sourceKey");

-- CreateIndex
CREATE INDEX "faculty_profiles_department_idx" ON "faculty_profiles"("department");

-- CreateIndex
CREATE INDEX "faculty_claims_profileId_status_idx" ON "faculty_claims"("profileId", "status");

-- CreateIndex
CREATE INDEX "calendar_entries_layer_startAt_idx" ON "calendar_entries"("layer", "startAt");

-- CreateIndex
CREATE INDEX "calendar_entries_ownerId_idx" ON "calendar_entries"("ownerId");

-- CreateIndex
CREATE INDEX "calendar_occurrences_startsAt_idx" ON "calendar_occurrences"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "placement_records_academicYear_programme_branchCode_company_key" ON "placement_records"("academicYear", "programme", "branchCode", "company", "offerType");

-- CreateIndex
CREATE INDEX "admin_moderation_reports_status_createdAt_idx" ON "admin_moderation_reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_moderation_reports_targetType_targetId_reporterId_key" ON "admin_moderation_reports"("targetType", "targetId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "societies_societies_logoAssetId_key" ON "societies_societies"("logoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "societies_societies_bannerAssetId_key" ON "societies_societies"("bannerAssetId");

-- AddForeignKey
ALTER TABLE "societies_societies" ADD CONSTRAINT "societies_societies_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "assets_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_societies" ADD CONSTRAINT "societies_societies_bannerAssetId_fkey" FOREIGN KEY ("bannerAssetId") REFERENCES "assets_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "societies_faculty_associations" ADD CONSTRAINT "societies_faculty_associations_facultyProfileId_fkey" FOREIGN KEY ("facultyProfileId") REFERENCES "faculty_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets_assets" ADD CONSTRAINT "assets_assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_notifications" ADD CONSTRAINT "notifications_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events_events" ADD CONSTRAINT "events_events_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "societies_societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events_events" ADD CONSTRAINT "events_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events_interests" ADD CONSTRAINT "events_interests_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events_interests" ADD CONSTRAINT "events_interests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events_registrations" ADD CONSTRAINT "events_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events_registrations" ADD CONSTRAINT "events_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_requests" ADD CONSTRAINT "findmates_requests_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_request_skills" ADD CONSTRAINT "findmates_request_skills_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "findmates_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_request_skills" ADD CONSTRAINT "findmates_request_skills_tagSlug_fkey" FOREIGN KEY ("tagSlug") REFERENCES "identity_skill_tags"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_responses" ADD CONSTRAINT "findmates_responses_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "findmates_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_responses" ADD CONSTRAINT "findmates_responses_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_connections" ADD CONSTRAINT "findmates_connections_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "findmates_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_connections" ADD CONSTRAINT "findmates_connections_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "findmates_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_connections" ADD CONSTRAINT "findmates_connections_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_connections" ADD CONSTRAINT "findmates_connections_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_chat_messages" ADD CONSTRAINT "findmates_chat_messages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "findmates_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findmates_chat_messages" ADD CONSTRAINT "findmates_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studymaterial_materials" ADD CONSTRAINT "studymaterial_materials_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studymaterial_materials" ADD CONSTRAINT "studymaterial_materials_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studymaterial_materials" ADD CONSTRAINT "studymaterial_materials_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "identity_branches"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studymaterial_votes" ADD CONSTRAINT "studymaterial_votes_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "studymaterial_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studymaterial_votes" ADD CONSTRAINT "studymaterial_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_projects" ADD CONSTRAINT "archive_projects_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_projects" ADD CONSTRAINT "archive_projects_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_project_tags" ADD CONSTRAINT "archive_project_tags_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "archive_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_screenshots" ADD CONSTRAINT "archive_screenshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "archive_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_screenshots" ADD CONSTRAINT "archive_screenshots_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_votes" ADD CONSTRAINT "archive_votes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "archive_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_votes" ADD CONSTRAINT "archive_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_comments" ADD CONSTRAINT "archive_comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "archive_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_comments" ADD CONSTRAINT "archive_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_comments" ADD CONSTRAINT "archive_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "archive_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_profiles" ADD CONSTRAINT "faculty_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_profiles" ADD CONSTRAINT "faculty_profiles_photoAssetId_fkey" FOREIGN KEY ("photoAssetId") REFERENCES "assets_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_claims" ADD CONSTRAINT "faculty_claims_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "faculty_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_claims" ADD CONSTRAINT "faculty_claims_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_claims" ADD CONSTRAINT "faculty_claims_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_occurrences" ADD CONSTRAINT "calendar_occurrences_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "calendar_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "identity_branches"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_moderation_reports" ADD CONSTRAINT "admin_moderation_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_moderation_reports" ADD CONSTRAINT "admin_moderation_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "identity_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Rules Prisma cannot model. Hand-written below this line.
-- ---------------------------------------------------------------------------------------------

-- Search (FR-FAC-2: tsvector + pg_trgm; FR-MAT-3; FR-ARC-3). Expression indexes; queries use the same
-- expressions.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "faculty_profiles_search_idx" ON "faculty_profiles" USING GIN (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("department", '') || ' ' || coalesce("designation", '') || ' ' || coalesce("specialization", '')));
CREATE INDEX "faculty_profiles_name_trgm_idx" ON "faculty_profiles" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "studymaterial_materials_search_idx" ON "studymaterial_materials" USING GIN (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("subjectCode", '') || ' ' || coalesce("description", '')));
CREATE INDEX "archive_projects_search_idx" ON "archive_projects" USING GIN (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", '')));

-- Outbox claiming (background-jobs.md §3.1).
CREATE INDEX "outbox_events_due_idx" ON "outbox_events" ("availableAt") WHERE "status" IN ('PENDING', 'PROCESSING');
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts" CHECK ("attemptCount" >= 0);

-- Assets.
ALTER TABLE "assets_assets"
  ADD CONSTRAINT "assets_assets_size" CHECK ("declaredSize" > 0 AND ("actualSize" IS NULL OR "actualSize" >= 0)),
  ADD CONSTRAINT "assets_assets_sha256" CHECK ("sha256Declared" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "assets_assets_approved_has_key" CHECK ("status" <> 'APPROVED' OR "publishedKey" IS NOT NULL),
  ADD CONSTRAINT "assets_assets_rejected_has_reason" CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL);

-- Events (FR-EVT-1, FR-EVT-3, OI-13).
ALTER TABLE "events_events"
  ADD CONSTRAINT "events_events_times" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "events_events_capacity" CHECK ("capacity" BETWEEN 1 AND 100000),
  ADD CONSTRAINT "events_events_counts" CHECK ("registeredCount" >= 0 AND "registeredCount" <= "capacity" AND "interestCount" >= 0),
  ADD CONSTRAINT "events_events_title" CHECK (char_length(btrim("title")) BETWEEN 3 AND 150);

-- Find Mates (UC-10 step 4, SPEC-MATE-COUNT).
ALTER TABLE "findmates_requests"
  ADD CONSTRAINT "findmates_requests_team_size" CHECK ("teamSize" BETWEEN 2 AND 10),
  ADD CONSTRAINT "findmates_requests_count" CHECK ("currentCount" BETWEEN 1 AND "teamSize");
ALTER TABLE "findmates_responses" ADD CONSTRAINT "findmates_responses_message" CHECK (char_length("message") BETWEEN 1 AND 1000);
ALTER TABLE "findmates_chat_messages" ADD CONSTRAINT "findmates_chat_messages_body" CHECK (char_length("body") BETWEEN 1 AND 4000);

-- Study material (FR-MAT-1).
ALTER TABLE "studymaterial_materials"
  ADD CONSTRAINT "studymaterial_materials_semester" CHECK ("semester" BETWEEN 1 AND 10),
  ADD CONSTRAINT "studymaterial_materials_votes" CHECK ("upvoteCount" >= 0);

-- Archive (SPEC-ARC-DEPTH, OI-39).
ALTER TABLE "archive_comments" ADD CONSTRAINT "archive_comments_depth" CHECK ("depth" BETWEEN 1 AND 3);
ALTER TABLE "archive_screenshots" ADD CONSTRAINT "archive_screenshots_position" CHECK ("position" BETWEEN 0 AND 4);
ALTER TABLE "archive_projects"
  ADD CONSTRAINT "archive_projects_github" CHECK ("githubUrl" ~ '^https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$'),
  ADD CONSTRAINT "archive_projects_votes" CHECK ("upvoteCount" >= 0);

-- Faculty claims (ADR-0010): one pending claim per profile.
CREATE UNIQUE INDEX "faculty_claims_one_pending" ON "faculty_claims" ("profileId") WHERE "status" = 'PENDING';

-- Calendar.
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_times" CHECK ("endAt" >= "startAt");
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_owner" CHECK (("layer" = 'PERSONAL') = ("ownerId" IS NOT NULL));

-- Placement (PLC-1, PLC-3: aggregates only).
ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_counts" CHECK ("offerCount" >= 0 AND ("eligibleCount" IS NULL OR "eligibleCount" >= 0) AND ("placedCount" IS NULL OR "placedCount" >= 0)),
  ADD CONSTRAINT "placement_records_placed_le_eligible" CHECK ("placedCount" IS NULL OR "eligibleCount" IS NULL OR "placedCount" <= "eligibleCount");
