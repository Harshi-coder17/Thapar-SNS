import "server-only";

// First-time profile completion (FR-AUTH-2): name, roll number, branch, year and at least three
// skill/interest tags from the controlled vocabulary. Validation runs here on the server; the form
// only mirrors it. The roll number is private (OI-27): only the user and admins may see it.
import { z } from "zod";

import type { PrismaClient } from "@/shared/db/client";

export const MIN_SKILL_TAGS = 3;
export const MAX_SKILL_TAGS = 10;

/** Roll number format [PROPOSED] (OI-27): 6 to 15 letters or digits, stored upper-cased. */
const ROLL_NUMBER = /^[A-Za-z0-9]{6,15}$/;

export const profileInputSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100, "Use at most 100 characters."),
  rollNumber: z
    .string()
    .trim()
    .regex(ROLL_NUMBER, "Use 6 to 15 letters or digits.")
    .transform((value) => value.toUpperCase()),
  branchCode: z.string().min(1, "Choose your branch."),
  year: z.coerce.number().int().min(1, "Choose your year.").max(5, "Choose your year."),
  tags: z
    .array(z.string())
    .transform((tags) => [...new Set(tags)])
    .pipe(z.array(z.string()).min(MIN_SKILL_TAGS, `Choose at least ${MIN_SKILL_TAGS} tags.`).max(MAX_SKILL_TAGS, `Choose at most ${MAX_SKILL_TAGS} tags.`)),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export type CompleteProfileResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION"; fields: Record<string, string> }
  | { ok: false; code: "ALREADY_COMPLETED" | "ROLL_NUMBER_TAKEN" };

export interface ProfileOptions {
  branches: { code: string; name: string }[];
  tags: { slug: string; label: string; category: string }[];
}

/** Active branches and tags for the profile form. */
export async function getProfileOptions(prisma: PrismaClient): Promise<ProfileOptions> {
  const [branches, tags] = await Promise.all([
    prisma.branch.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { code: true, name: true } }),
    prisma.skillTag.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { slug: true, label: true, category: true } }),
  ]);
  return { branches, tags };
}

export function validateProfileInput(raw: unknown): { ok: true; input: ProfileInput } | { ok: false; fields: Record<string, string> } {
  const parsed = profileInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, input: parsed.data };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return { ok: false, fields };
}

/** Completes the signed-in user's profile once. Every rule is enforced again inside the transaction. */
export async function completeProfile(prisma: PrismaClient, userId: string, raw: unknown): Promise<CompleteProfileResult> {
  const validated = validateProfileInput(raw);
  if (!validated.ok) return { ok: false, code: "VALIDATION", fields: validated.fields };
  const { input } = validated;
  try {
    return await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { code: input.branchCode, active: true }, select: { code: true } });
      const knownTags = await tx.skillTag.count({ where: { slug: { in: input.tags }, active: true } });
      const fields: Record<string, string> = {};
      if (!branch) fields.branchCode = "Choose your branch.";
      if (knownTags !== input.tags.length) fields.tags = "Choose tags from the list.";
      if (Object.keys(fields).length > 0) return { ok: false, code: "VALIDATION", fields } as const;

      // Conditional update: only a profile that is not yet completed can be completed (no races).
      const updated = await tx.user.updateMany({
        where: { id: userId, profileCompletedAt: null },
        data: { name: input.name, rollNumber: input.rollNumber, branchCode: input.branchCode, year: input.year, profileCompletedAt: new Date() },
      });
      if (updated.count === 0) return { ok: false, code: "ALREADY_COMPLETED" } as const;
      await tx.userSkill.createMany({ data: input.tags.map((tagSlug) => ({ userId, tagSlug })) });
      return { ok: true } as const;
    });
  } catch (error) {
    // P2002: unique constraint (identity_users.rollNumber); the only unique column written here.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return { ok: false, code: "ROLL_NUMBER_TAKEN" };
    throw error;
  }
}

export interface PublicProfile {
  id: string;
  name: string;
  branchCode: string | null;
  branchName: string | null;
  year: number | null;
  skills: { slug: string; label: string }[];
  memberSince: Date;
}

/** UCD-2 / OI-35: what any signed-in student may see of a profile (never the roll number or email). */
export async function getPublicProfile(prisma: PrismaClient, userId: string): Promise<PublicProfile | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, profileCompletedAt: { not: null }, bannedAt: null },
    select: { id: true, name: true, branchCode: true, year: true, createdAt: true, branch: { select: { name: true } }, skills: { select: { tag: { select: { slug: true, label: true } } }, orderBy: { tag: { label: "asc" } } } },
  });
  if (!user) return null;
  return { id: user.id, name: user.name, branchCode: user.branchCode, branchName: user.branch?.name ?? null, year: user.year, skills: user.skills.map((s) => s.tag), memberSince: user.createdAt };
}

const updateSchema = profileInputSchema.omit({ rollNumber: true });

/** OI-35: the owner edits name, branch, year and skills. The roll number cannot be changed here. */
export async function updateProfile(prisma: PrismaClient, userId: string, raw: unknown): Promise<{ ok: true } | { ok: false; fields: Record<string, string> }> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, fields };
  }
  const input = parsed.data;
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { code: input.branchCode, active: true }, select: { code: true } });
    const knownTags = await tx.skillTag.count({ where: { slug: { in: input.tags }, active: true } });
    const fields: Record<string, string> = {};
    if (!branch) fields.branchCode = "Choose your branch.";
    if (knownTags !== input.tags.length) fields.tags = "Choose tags from the list.";
    if (Object.keys(fields).length > 0) return { ok: false, fields } as const;
    const updated = await tx.user.updateMany({ where: { id: userId, profileCompletedAt: { not: null } }, data: { name: input.name, branchCode: input.branchCode, year: input.year } });
    if (updated.count === 0) return { ok: false, fields: { form: "Complete your profile first." } } as const;
    await tx.userSkill.deleteMany({ where: { userId } });
    await tx.userSkill.createMany({ data: input.tags.map((tagSlug) => ({ userId, tagSlug })) });
    return { ok: true } as const;
  });
}
