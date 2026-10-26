-- Session inactivity tracking (owner session policy 2026-10-26). Additive: one column; existing sessions start as active now.

-- AlterTable
ALTER TABLE "identity_sessions" ADD COLUMN     "lastActiveAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

