// Find Mates request schemas (FR-MATE-1..5, UC-10 steps 2 and 4, OI-15).
import { z } from "zod";

export const MAX_SKILLS = 10;
export const MAX_EXPIRY_DAYS = 90;

export const createRequestSchema = z
  .object({
    title: z.string().trim().min(3, "Use at least 3 characters.").max(120, "Use at most 120 characters."),
    /** Rich text, sanitised in the service (UC-10 step 5). */
    description: z.string().max(50_000),
    type: z.enum(["HACKATHON", "PROJECT", "CASUAL"], { error: "Choose a type." }),
    subject: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(60, "Use at most 60 characters.").optional()),
    skills: z
      .array(z.string().min(1).max(60))
      .transform((list) => [...new Set(list)])
      .pipe(z.array(z.string()).min(1, "Choose at least one skill.").max(MAX_SKILLS, `Choose at most ${MAX_SKILLS} skills.`)),
    // UC-10 step 4: team size between 2 and 10.
    teamSize: z.coerce.number().int("Use a whole number.").min(2, "A team has 2 to 10 people.").max(10, "A team has 2 to 10 people."),
    expiresAt: z.iso.datetime({ offset: true, error: "Choose a valid expiry date." }),
  })
  .strict();

export const respondSchema = z.object({ message: z.string().trim().min(1, "Write a short message.").max(1000, "Use at most 1000 characters.") }).strict();
export const decideSchema = z.object({ decision: z.enum(["ACCEPT", "REJECT"]) }).strict();
export const messageSchema = z.object({ body: z.string().trim().min(1, "Write a message.").max(4000, "Use at most 4000 characters.") }).strict();

/** OI-17: transparent skill overlap (Jaccard index) between a request's skills and a person's skills, 0 to 1. */
export function matchScore(requestSkills: readonly string[], personSkills: readonly string[]): number {
  const a = new Set(requestSkills);
  const b = new Set(personSkills);
  if (a.size === 0 && b.size === 0) return 0;
  let common = 0;
  for (const skill of a) if (b.has(skill)) common += 1;
  return common / (a.size + b.size - common);
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  return fields;
}
