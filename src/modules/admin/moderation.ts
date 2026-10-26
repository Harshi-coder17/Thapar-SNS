import "server-only";

// Moderation reports (Slice 5, OI-28). Any signed-in user may report content once per item; admins
// (platform capacity) resolve reports by hiding the content or dismissing the report. The content's
// owning module performs the change through the handlers it exposes (wired in the route layer, so this
// module does not import feature modules). Every decision is audited.
import type { PrismaClient } from "@/shared/db/client";
import { type ApiActor, conflict, forbidden, invalid, invalidState, notFound, ok, type ServiceResult } from "@/shared/http/api-action";
import { z } from "zod";

import { audit } from "./audit";

export const TARGET_TYPES = ["SOCIETY_POST", "STUDY_MATERIAL", "ARCHIVE_PROJECT", "ARCHIVE_COMMENT", "CHAT_MESSAGE"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
export const TARGET_LABELS: Record<TargetType, string> = { SOCIETY_POST: "Society post", STUDY_MATERIAL: "Study material", ARCHIVE_PROJECT: "Archive project", ARCHIVE_COMMENT: "Archive comment", CHAT_MESSAGE: "Chat message" };

export interface TargetHandler {
  /** True when the reporter can see the item (reporting something you cannot see is refused as not found). */
  visibleTo(targetId: string, userId: string): Promise<boolean>;
  /** Hides (or for posts, removes) the item. False when it no longer exists. */
  hide(targetId: string): Promise<boolean>;
  /** Restores a hidden item; absent where removal is final. */
  restore?(targetId: string): Promise<boolean>;
  /** Short preview text for the admin queue. */
  preview(targetId: string): Promise<string | null>;
}

export type TargetHandlers = Record<TargetType, TargetHandler>;

const reportSchema = z.object({ targetType: z.enum(TARGET_TYPES), targetId: z.uuid(), reason: z.string().trim().min(5, "Tell us briefly what is wrong.").max(500) }).strict();
const resolveSchema = z.object({ action: z.enum(["HIDE", "DISMISS"]), note: z.string().trim().min(3, "Add a short note.").max(300) }).strict();
const restoreSchema = z.object({ targetType: z.enum(TARGET_TYPES), targetId: z.uuid(), note: z.string().trim().min(3, "Add a short note.").max(300) }).strict();

const fieldErrors = (error: z.ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
};

export async function createReport(prisma: PrismaClient, targets: TargetHandlers, actor: ApiActor, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const { targetType, targetId, reason } = parsed.data;
  if (!(await targets[targetType].visibleTo(targetId, actor.userId))) return notFound;
  const existing = await prisma.moderationReport.findUnique({ where: { targetType_targetId_reporterId: { targetType, targetId, reporterId: actor.userId } }, select: { id: true } });
  if (existing) return conflict("You have already reported this.");
  try {
    const report = await prisma.moderationReport.create({ data: { targetType, targetId, reporterId: actor.userId, reason }, select: { id: true } });
    return ok(report);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return conflict("You have already reported this.");
    throw error;
  }
}

/** Resolves every open report on the same item at once. */
export async function resolveReport(prisma: PrismaClient, targets: TargetHandlers, actor: ApiActor, reportId: string, raw: unknown, now = new Date()): Promise<ServiceResult> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = resolveSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const report = await prisma.moderationReport.findUnique({ where: { id: reportId }, select: { status: true, targetType: true, targetId: true } });
  if (!report) return notFound;
  if (report.status !== "OPEN") return invalidState("This report has already been handled.");
  const hide = parsed.data.action === "HIDE";
  // The owning module changes its own row first; the report bookkeeping follows (both idempotent).
  if (hide) await targets[report.targetType].hide(report.targetId);
  return prisma.$transaction(async (tx): Promise<ServiceResult> => {
    const { count } = await tx.moderationReport.updateMany({ where: { targetType: report.targetType, targetId: report.targetId, status: "OPEN" }, data: { status: hide ? "RESOLVED" : "DISMISSED", resolvedById: actor.userId, resolution: parsed.data.note, resolvedAt: now } });
    await audit(tx, { actorId: actor.userId, action: hide ? "admin.moderation.hidden" : "admin.moderation.dismissed", targetType: report.targetType.toLowerCase(), targetId: report.targetId, details: { reports: count } });
    return ok(undefined);
  });
}

export async function restoreTarget(prisma: PrismaClient, targets: TargetHandlers, actor: ApiActor, raw: unknown): Promise<ServiceResult> {
  if (actor.capacity !== "platform") return forbidden;
  const parsed = restoreSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const handler = targets[parsed.data.targetType];
  if (!handler.restore) return invalidState("Removed items of this kind cannot be restored.");
  if (!(await handler.restore(parsed.data.targetId))) return notFound;
  await audit(prisma, { actorId: actor.userId, action: "admin.moderation.restored", targetType: parsed.data.targetType.toLowerCase(), targetId: parsed.data.targetId });
  return ok(undefined);
}

export interface ReportGroup {
  reportId: string;
  targetType: TargetType;
  targetId: string;
  preview: string | null;
  reasons: string[];
  count: number;
  firstAt: Date;
}

export async function openReports(prisma: PrismaClient, targets: TargetHandlers): Promise<ReportGroup[]> {
  const rows = await prisma.moderationReport.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 500, select: { id: true, targetType: true, targetId: true, reason: true, createdAt: true } });
  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    const group = groups.get(key);
    if (group) {
      group.count++;
      if (group.reasons.length < 5) group.reasons.push(r.reason);
    } else groups.set(key, { reportId: r.id, targetType: r.targetType, targetId: r.targetId, preview: null, reasons: [r.reason], count: 1, firstAt: r.createdAt });
  }
  const list = [...groups.values()];
  for (const g of list) g.preview = await targets[g.targetType].preview(g.targetId);
  return list;
}

export interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: unknown;
  onBehalfOfType: string | null;
  onBehalfOfId: string | null;
  createdAt: Date;
}

/** Admin audit-log viewer (append-only table), newest first, keyset-paginated. */
export async function auditLog(prisma: PrismaClient, filters: { action?: string; targetType?: string; actorId?: string; onBehalfOfId?: string; before?: Date }, take = 100): Promise<AuditRow[]> {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.action ? { action: { startsWith: filters.action } } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.onBehalfOfId ? { onBehalfOfId: filters.onBehalfOfId } : {}),
      ...(filters.before ? { createdAt: { lt: filters.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export const openReportCount = (prisma: PrismaClient) => prisma.moderationReport.count({ where: { status: "OPEN" } });
