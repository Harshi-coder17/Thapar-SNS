import "server-only";

// Study material (Slice 2d: FR-MAT-1..4, UC-13, OI-18, OI-19). A material is listed only when its
// file is APPROVED by the quarantine-first pipeline (assets module); downloads use 5-minute signed
// URLs; one upvote per student per material (composite primary key, FR-MAT-4).
import { assetStatuses, ownedAssetFor } from "@/modules/assets";
import { apiDeps, profileOptions, userSummaries } from "@/modules/identity";
import type { Prisma, PrismaClient } from "@/shared/db/client";
import { getDb } from "@/shared/db/client";
import { type ApiActor, conflict, forbidden, invalid, notFound, ok, RATE, runAction, type ServiceResult } from "@/shared/http/api-action";
import { cleanPlainText } from "@/shared/security/sanitize-html";
import { z } from "zod";

export const MATERIAL_TYPES = ["NOTES", "PYQ", "REFERENCE"] as const;
export const TYPE_LABELS: Record<(typeof MATERIAL_TYPES)[number], string> = { NOTES: "Notes", PYQ: "Previous-year paper", REFERENCE: "Reference" };

const createSchema = z
  .object({
    assetId: z.uuid("Upload the file first."),
    subjectCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,5}[0-9]{2,4}[A-Z]?$/, "Use a subject code such as UCS503."),
    title: z.string().trim().min(3, "Use at least 3 characters.").max(150),
    description: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(1000).optional()),
    type: z.enum(MATERIAL_TYPES, { error: "Choose a type." }),
    semester: z.coerce.number().int().min(1, "Semester 1 to 10.").max(10, "Semester 1 to 10."),
    branchCode: z.string().min(1, "Choose a branch."),
  })
  .strict();

const fieldErrors = (error: z.ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
};

/** UC-13: attach metadata to an uploaded file. It appears in listings once the file is APPROVED. */
export async function createMaterial(prisma: PrismaClient, actor: ApiActor, raw: unknown): Promise<ServiceResult<{ id: string }>> {
  if (actor.capacity !== "personal") return forbidden;
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const input = parsed.data;
  const branches = new Set((await profileOptions()).branches.map((b) => b.code));
  if (!branches.has(input.branchCode)) return invalid({ branchCode: "Choose a branch from the list." });
  const asset = await ownedAssetFor(actor.userId, input.assetId, "STUDY_MATERIAL");
  if (!asset.ok) return asset.code === "INVALID_STATE" ? invalid({ assetId: asset.message }) : asset;
  if (await prisma.studyMaterial.findUnique({ where: { assetId: input.assetId }, select: { id: true } })) return conflict("This file is already attached to a material.");
  const material = await prisma.studyMaterial.create({
    data: { uploaderId: actor.userId, assetId: input.assetId, subjectCode: input.subjectCode, title: input.title, description: input.description ? cleanPlainText(input.description) : null, type: input.type, semester: input.semester, branchCode: input.branchCode },
    select: { id: true },
  });
  return ok(material);
}

/** FR-MAT-4: upvote (one per student) or remove the vote; the counter changes in the same transaction. */
export async function setVote(prisma: PrismaClient, actor: ApiActor, materialId: string, up: boolean): Promise<ServiceResult<{ upvoteCount: number; voted: boolean }>> {
  if (actor.capacity !== "personal") return forbidden;
  return prisma.$transaction(async (tx): Promise<ServiceResult<{ upvoteCount: number; voted: boolean }>> => {
    const material = await tx.studyMaterial.findFirst({ where: { id: materialId, deletedAt: null, hiddenAt: null }, select: { id: true, assetId: true } });
    if (!material || (await assetStatuses([material.assetId])).get(material.assetId)?.status !== "APPROVED") return notFound;
    const changed = up
      ? (await tx.studyMaterialVote.createMany({ data: [{ materialId, userId: actor.userId }], skipDuplicates: true })).count
      : -(await tx.studyMaterialVote.deleteMany({ where: { materialId, userId: actor.userId } })).count;
    const row = changed
      ? await tx.studyMaterial.update({ where: { id: materialId }, data: { upvoteCount: { increment: changed } }, select: { upvoteCount: true } })
      : await tx.studyMaterial.findUniqueOrThrow({ where: { id: materialId }, select: { upvoteCount: true } });
    return ok({ upvoteCount: row.upvoteCount, voted: up });
  });
}

/** OI-19: the uploader deletes their own material (soft delete; the file stays for audit). */
export async function deleteMaterial(prisma: PrismaClient, actor: ApiActor, materialId: string): Promise<ServiceResult> {
  const material = await prisma.studyMaterial.findFirst({ where: { id: materialId, deletedAt: null }, select: { uploaderId: true } });
  if (!material) return notFound;
  if (material.uploaderId !== actor.userId) return forbidden;
  await prisma.studyMaterial.update({ where: { id: materialId }, data: { deletedAt: new Date() } });
  return ok(undefined);
}

export interface MaterialCard {
  id: string;
  title: string;
  description: string | null;
  subjectCode: string;
  type: (typeof MATERIAL_TYPES)[number];
  semester: number;
  branchName: string;
  upvoteCount: number;
  voted: boolean;
  mime: string | null;
  size: number | null;
  assetId: string;
  createdAt: Date;
  uploaderName: string | null;
  mine: boolean;
}

export interface MaterialFilters {
  subjectCode?: string;
  semester?: number;
  branchCode?: string;
  type?: (typeof MATERIAL_TYPES)[number];
  q?: string;
  sort?: "new" | "top";
}

/** FR-MAT-3: browse by subject code and semester, search by keywords. APPROVED and visible only. */
export async function listMaterials(prisma: PrismaClient, userId: string, filters: MaterialFilters, names: (ids: string[]) => Promise<Map<string, { name: string }>>): Promise<MaterialCard[]> {
  const q = filters.q?.trim().slice(0, 100);
  let ids: string[] | undefined;
  if (q) {
    // Full-text search on the indexed expression (title, subject code, description), plus a subject-code prefix match.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "studymaterial_materials"
       WHERE "deletedAt" IS NULL AND "hiddenAt" IS NULL
         AND (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("subjectCode", '') || ' ' || coalesce("description", '')) @@ plainto_tsquery('simple', ${q})
              OR "subjectCode" ILIKE ${q.toUpperCase().replace(/[\\%_]/g, "\\$&") + "%"})
       LIMIT 500`;
    ids = rows.map((r) => r.id);
  }
  const where: Prisma.StudyMaterialWhereInput = {
    deletedAt: null,
    hiddenAt: null,
    ...(ids ? { id: { in: ids } } : {}),
    ...(filters.subjectCode ? { subjectCode: filters.subjectCode.toUpperCase() } : {}),
    ...(filters.semester ? { semester: filters.semester } : {}),
    ...(filters.branchCode ? { branchCode: filters.branchCode } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };
  const rows = await prisma.studyMaterial.findMany({
    where,
    orderBy: filters.sort === "top" ? [{ upvoteCount: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    take: 500,
    select: { id: true, title: true, description: true, subjectCode: true, type: true, semester: true, upvoteCount: true, assetId: true, createdAt: true, uploaderId: true, branch: { select: { name: true } }, votes: { where: { userId }, select: { userId: true } } },
  });
  const statuses = await assetStatuses(rows.map((r) => r.assetId));
  const visible = rows.filter((r) => statuses.get(r.assetId)?.status === "APPROVED").slice(0, 100);
  const people = await names(visible.flatMap((r) => (r.uploaderId ? [r.uploaderId] : [])));
  return visible.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    subjectCode: r.subjectCode,
    type: r.type,
    semester: r.semester,
    branchName: r.branch.name,
    upvoteCount: r.upvoteCount,
    voted: r.votes.length > 0,
    mime: statuses.get(r.assetId)?.mime ?? null,
    size: statuses.get(r.assetId)?.size ?? null,
    assetId: r.assetId,
    createdAt: r.createdAt,
    uploaderName: r.uploaderId ? (people.get(r.uploaderId)?.name ?? null) : null,
    mine: r.uploaderId === userId,
  }));
}

/** The uploader's own materials with their pipeline status ("Processing", "Rejected: reason"). */
export async function myUploads(prisma: PrismaClient, userId: string) {
  const rows = await prisma.studyMaterial.findMany({ where: { uploaderId: userId, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, subjectCode: true, assetId: true, createdAt: true, hiddenAt: true } });
  const statuses = await assetStatuses(rows.map((r) => r.assetId));
  return rows.map((r) => ({ ...r, status: statuses.get(r.assetId)?.status ?? "UNKNOWN", rejectionReason: statuses.get(r.assetId)?.rejectionReason ?? null }));
}

/** Subject codes with counts of visible materials (montage panel 5 subject list). */
export async function subjectCounts(prisma: PrismaClient): Promise<{ subjectCode: string; count: number }[]> {
  const rows = await prisma.studyMaterial.groupBy({ by: ["subjectCode"], where: { deletedAt: null, hiddenAt: null }, _count: { _all: true }, orderBy: { subjectCode: "asc" }, take: 200 });
  return rows.map((r) => ({ subjectCode: r.subjectCode, count: r._count._all }));
}

/** The asset of a visible material (for the download route). */
export async function materialAsset(prisma: PrismaClient, materialId: string): Promise<string | null> {
  const row = await prisma.studyMaterial.findFirst({ where: { id: materialId, deletedAt: null, hiddenAt: null }, select: { assetId: true } });
  return row?.assetId ?? null;
}

/** Moderation (Slice 5). */
export async function setMaterialHidden(prisma: PrismaClient, materialId: string, hidden: boolean): Promise<boolean> {
  const { count } = await prisma.studyMaterial.updateMany({ where: { id: materialId }, data: { hiddenAt: hidden ? new Date() : null } });
  return count === 1;
}

// Wiring for routes and pages.
const names = async (ids: string[]) => userSummaries(ids);
export const materials = {
  list: (userId: string, filters: MaterialFilters) => listMaterials(getDb(), userId, filters, names),
  mine: (userId: string) => myUploads(getDb(), userId),
  subjects: () => subjectCounts(getDb()),
  assetOf: (materialId: string) => materialAsset(getDb(), materialId),
  setHidden: (materialId: string, hidden: boolean) => setMaterialHidden(getDb(), materialId, hidden),
  count: () => getDb().studyMaterial.count({ where: { deletedAt: null, hiddenAt: null } }),
  title: async (materialId: string) => (await getDb().studyMaterial.findUnique({ where: { id: materialId }, select: { title: true, subjectCode: true } })) ?? null,
};

export const materialsApi = {
  create: (request: Request) =>
    runAction(apiDeps(), request, { name: "materials:create", rules: RATE.create, body: true, status: 201, run: (actor, body) => createMaterial(getDb(), actor, body), output: (v) => ({ material: v }) }),
  vote: (request: Request, id: string, up: boolean) => runAction(apiDeps(), request, { name: "materials:vote", rules: RATE.write, ids: [id], run: (actor) => setVote(getDb(), actor, id, up) }),
  remove: (request: Request, id: string) => runAction(apiDeps(), request, { name: "materials:delete", rules: RATE.write, ids: [id], run: (actor) => deleteMaterial(getDb(), actor, id) }),
};
