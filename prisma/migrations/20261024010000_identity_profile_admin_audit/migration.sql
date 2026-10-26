-- AlterTable
ALTER TABLE "identity_users" ADD COLUMN     "branchCode" TEXT,
ADD COLUMN     "profileCompletedAt" TIMESTAMPTZ(6),
ADD COLUMN     "rollNumber" TEXT,
ADD COLUMN     "year" SMALLINT;

-- CreateTable
CREATE TABLE "identity_branches" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "identity_branches_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "identity_skill_tags" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "identity_skill_tags_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "identity_user_skills" (
    "userId" UUID NOT NULL,
    "tagSlug" TEXT NOT NULL,

    CONSTRAINT "identity_user_skills_pkey" PRIMARY KEY ("userId","tagSlug")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_branches_name_key" ON "identity_branches"("name");

-- CreateIndex
CREATE UNIQUE INDEX "identity_skill_tags_label_key" ON "identity_skill_tags"("label");

-- CreateIndex
CREATE INDEX "identity_user_skills_tagSlug_idx" ON "identity_user_skills"("tagSlug");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetType_targetId_idx" ON "admin_audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "identity_users_rollNumber_key" ON "identity_users"("rollNumber");

-- AddForeignKey
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_branchCode_fkey" FOREIGN KEY ("branchCode") REFERENCES "identity_branches"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_user_skills" ADD CONSTRAINT "identity_user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_user_skills" ADD CONSTRAINT "identity_user_skills_tagSlug_fkey" FOREIGN KEY ("tagSlug") REFERENCES "identity_skill_tags"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Profile integrity (FR-AUTH-2). Not expressible in the Prisma schema.
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_year_check" CHECK ("year" IS NULL OR "year" BETWEEN 1 AND 5);
ALTER TABLE "identity_users" ADD CONSTRAINT "identity_users_profile_complete_check" CHECK (
  "profileCompletedAt" IS NULL OR ("rollNumber" IS NOT NULL AND "branchCode" IS NOT NULL AND "year" IS NOT NULL)
);

-- Audit log is append-only: any UPDATE or DELETE fails, for every database role used by the app.
CREATE FUNCTION "admin_audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only';
END;
$$;
CREATE TRIGGER "admin_audit_logs_no_update_delete" BEFORE UPDATE OR DELETE ON "admin_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "admin_audit_logs_append_only"();
CREATE TRIGGER "admin_audit_logs_no_truncate" BEFORE TRUNCATE ON "admin_audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "admin_audit_logs_append_only"();

-- Seed: programmes from the TIET admissions FAQ (admission.thapar.edu/faq, checked 2026-10-24) plus
-- department programme pages. Codes are internal to this app, not official TIET codes.
-- [PROPOSED] for owner review; admins curate this list later (Slice 5).
INSERT INTO "identity_branches" ("code", "name", "sortOrder") VALUES
  ('COE', 'Computer Engineering', 0),
  ('CSE', 'Computer Science and Engineering', 10),
  ('AIDS', 'Artificial Intelligence and Data Science', 20),
  ('CSBS', 'Computer Science and Business Systems', 30),
  ('ECE', 'Electronics and Communication Engineering', 40),
  ('ENC', 'Electronics and Computer Engineering', 50),
  ('VLSI', 'Electronics Engineering (VLSI Design and Technology)', 60),
  ('EIC', 'Electronics (Instrumentation and Control) Engineering', 70),
  ('ELE', 'Electrical Engineering', 80),
  ('ELC', 'Electrical and Computer Engineering', 90),
  ('MEC', 'Mechanical Engineering', 100),
  ('MTX', 'Mechatronics', 110),
  ('RAI', 'Robotics and Artificial Intelligence', 120),
  ('CIV', 'Civil Engineering', 130),
  ('CHE', 'Chemical Engineering', 140),
  ('BT', 'Biotechnology', 150),
  ('BME', 'Biomedical Engineering', 160);

-- Seed: controlled skill/interest vocabulary (OI-42 recommended default) [PROPOSED] for owner review.
INSERT INTO "identity_skill_tags" ("slug", "label", "category", "sortOrder") VALUES
  ('c', 'C', 'Programming', 0),
  ('cpp', 'C++', 'Programming', 10),
  ('java', 'Java', 'Programming', 20),
  ('python', 'Python', 'Programming', 30),
  ('javascript', 'JavaScript', 'Programming', 40),
  ('typescript', 'TypeScript', 'Programming', 50),
  ('go', 'Go', 'Programming', 60),
  ('rust', 'Rust', 'Programming', 70),
  ('kotlin', 'Kotlin', 'Programming', 80),
  ('swift', 'Swift', 'Programming', 90),
  ('web-development', 'Web Development', 'Development', 100),
  ('frontend', 'Frontend', 'Development', 110),
  ('backend', 'Backend', 'Development', 120),
  ('mobile-apps', 'Mobile Apps', 'Development', 130),
  ('game-development', 'Game Development', 'Development', 140),
  ('devops', 'DevOps', 'Development', 150),
  ('cloud-computing', 'Cloud Computing', 'Development', 160),
  ('databases', 'Databases', 'Development', 170),
  ('open-source', 'Open Source', 'Development', 180),
  ('competitive-programming', 'Competitive Programming', 'Development', 190),
  ('machine-learning', 'Machine Learning', 'AI and Data', 200),
  ('deep-learning', 'Deep Learning', 'AI and Data', 210),
  ('data-science', 'Data Science', 'AI and Data', 220),
  ('data-analysis', 'Data Analysis', 'AI and Data', 230),
  ('computer-vision', 'Computer Vision', 'AI and Data', 240),
  ('natural-language-processing', 'Natural Language Processing', 'AI and Data', 250),
  ('cybersecurity', 'Cybersecurity', 'Security and Systems', 260),
  ('networking', 'Networking', 'Security and Systems', 270),
  ('operating-systems', 'Operating Systems', 'Security and Systems', 280),
  ('blockchain', 'Blockchain', 'Security and Systems', 290),
  ('embedded-systems', 'Embedded Systems', 'Hardware', 300),
  ('iot', 'IoT', 'Hardware', 310),
  ('robotics', 'Robotics', 'Hardware', 320),
  ('vlsi', 'VLSI', 'Hardware', 330),
  ('pcb-design', 'PCB Design', 'Hardware', 340),
  ('drones', 'Drones', 'Hardware', 350),
  ('3d-printing', '3D Printing', 'Hardware', 360),
  ('ui-ux-design', 'UI/UX Design', 'Design', 370),
  ('graphic-design', 'Graphic Design', 'Design', 380),
  ('video-editing', 'Video Editing', 'Design', 390),
  ('photography', 'Photography', 'Design', 400),
  ('product-design', 'Product Design', 'Design', 410),
  ('cad', 'CAD', 'Design', 420),
  ('entrepreneurship', 'Entrepreneurship', 'Business', 430),
  ('product-management', 'Product Management', 'Business', 440),
  ('marketing', 'Marketing', 'Business', 450),
  ('finance', 'Finance', 'Business', 460),
  ('consulting', 'Consulting', 'Business', 470),
  ('research', 'Research', 'Academics and Research', 480),
  ('mathematics', 'Mathematics', 'Academics and Research', 490),
  ('physics', 'Physics', 'Academics and Research', 500),
  ('chemistry', 'Chemistry', 'Academics and Research', 510),
  ('biotechnology-research', 'Biotechnology Research', 'Academics and Research', 520),
  ('electronics', 'Electronics', 'Academics and Research', 530),
  ('mechanical-design', 'Mechanical Design', 'Academics and Research', 540),
  ('civil-structures', 'Civil Structures', 'Academics and Research', 550),
  ('sustainability', 'Sustainability', 'Academics and Research', 560),
  ('public-speaking', 'Public Speaking', 'Activities', 570),
  ('writing', 'Writing', 'Activities', 580),
  ('event-management', 'Event Management', 'Activities', 590),
  ('music', 'Music', 'Activities', 600),
  ('dance', 'Dance', 'Activities', 610),
  ('sports', 'Sports', 'Activities', 620),
  ('quizzing', 'Quizzing', 'Activities', 630),
  ('debating', 'Debating', 'Activities', 640);
