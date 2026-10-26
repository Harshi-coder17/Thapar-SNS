import "server-only";

// Public interface of the admin module (docs/architecture/modules.md §3). The audit log is
// append-only (database trigger); entries are written inside the caller's transaction so an action
// and its audit record succeed or fail together.
export type { AuditEntry } from "./audit";
export { audit } from "./audit";

export type { AuditRow, ReportGroup, TargetHandler, TargetHandlers, TargetType } from "./moderation";
export { auditLog, createReport, openReports, resolveReport, restoreTarget, TARGET_LABELS, TARGET_TYPES } from "./moderation";

/** Open moderation reports (dashboard count). */
export { openReportCount } from "./moderation";
