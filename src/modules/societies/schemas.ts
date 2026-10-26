// Request schemas for the societies API (docs/api/societies.md). The server validates every field;
// forms only mirror these rules. Rich text is sanitised in the service after validation.
import { z } from "zod";

export const NAME_MAX = 150;
export const DESCRIPTION_MAX = 4000;
export const SHORT_NAME_MAX = 30;
export const POSITION_MAX = 60;
/** Sanity limit on initial Heads in one request; the number of Heads itself is not limited. */
export const MAX_INITIAL_HEADS = 20;
export const POST_TITLE_MAX = 120;
/** Plain-text length of a post body (after sanitising). */
export const POST_BODY_MAX = 5000;
export const STORY_MAX = 280;
export const REQUEST_MESSAGE_MAX = 500;
export const MAX_ROLES_SOUGHT = 10;

/** Treats "" and whitespace-only strings as absent, so optional form fields can be left empty. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

const httpsUrl = z
  .string()
  .trim()
  .max(300, "Use at most 300 characters.")
  .pipe(z.url({ protocol: /^https$/, error: "Use a full https:// link." }));

export const socialLinksSchema = z
  .object({ website: optional(httpsUrl), instagram: optional(httpsUrl), linkedin: optional(httpsUrl) })
  .strict();

export type SocialLinks = z.infer<typeof socialLinksSchema>;

const societyName = z.string().trim().min(3, "Use at least 3 characters.").max(NAME_MAX, `Use at most ${NAME_MAX} characters.`);
// Optional (ADR-0013): an organisation may have no description and no category.
const description = optional(z.string().trim().max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters.`));
const categorySlug = optional(z.string().max(60));
const shortName = optional(z.string().trim().max(SHORT_NAME_MAX, `Use at most ${SHORT_NAME_MAX} characters.`));
const email = (message: string) => z.string().trim().max(200).pipe(z.email(message));
const contactEmail = optional(z.string().trim().max(200).pipe(z.email("Enter a valid email address.")));

export const createSocietySchema = z
  .object({
    name: societyName,
    description,
    shortName,
    categorySlug,
    // ADR-0013: one or more initial Heads, each of whom must have signed in at least once.
    headEmails: z
      .array(email("Enter each Head's @thapar.edu email address."))
      .transform((list) => [...new Set(list.map((value) => value.toLowerCase()))])
      .pipe(z.array(z.string()).min(1, "Appoint at least one Head.").max(MAX_INITIAL_HEADS, `Appoint at most ${MAX_INITIAL_HEADS} Heads at once.`)),
    links: socialLinksSchema.default({}),
    contactEmail,
  })
  .strict();

/** Profile edit. `name` may be changed by admins only (checked in the service): it is the society's identity. */
export const updateSocietySchema = z
  .object({ name: optional(societyName), shortName, description, categorySlug, links: socialLinksSchema.default({}), contactEmail })
  .strict();

export const setActiveSchema = z.object({ active: z.boolean() }).strict();

/** Add a Head, or hand over to an incoming Head (ADR-0013 §3.1). */
export const headEmailSchema = z.object({ email: email("Enter the person's @thapar.edu email address.") }).strict();

export const membershipRequestSchema = z.object({ message: optional(z.string().trim().max(REQUEST_MESSAGE_MAX, `Use at most ${REQUEST_MESSAGE_MAX} characters.`)) }).strict();

export const decideRequestSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) }).strict();

/** Display information only (ADR-0013 §3.2): never a permission. `position: null` clears the title. */
export const memberDisplaySchema = z
  .object({
    group: z.enum(["CORE", "GENERAL"]).optional(),
    position: z.union([z.null(), z.string().trim().max(POSITION_MAX, `Use at most ${POSITION_MAX} characters.`)]).optional(),
  })
  .strict()
  .refine((value) => value.group !== undefined || value.position !== undefined, { message: "Change the group or the title." });

export const facultyReviewSchema = z.object({ verified: z.boolean() }).strict();

const recruitmentSchema = z
  .object({
    rolesSought: z
      .array(z.string().trim().min(2, "Each role needs at least 2 characters.").max(60, "Use at most 60 characters per role."))
      .transform((roles) => [...new Set(roles)])
      .pipe(z.array(z.string()).min(1, "List at least one role.").max(MAX_ROLES_SOUGHT, `List at most ${MAX_ROLES_SOUGHT} roles.`)),
    eligibleYears: z
      .array(z.coerce.number().int().min(1).max(5))
      .default([])
      .transform((years) => [...new Set(years)].sort()),
    eligibleBranchCodes: z
      .array(z.string().min(1).max(20))
      .max(30)
      .default([])
      .transform((codes) => [...new Set(codes)]),
    deadline: optional(z.iso.datetime({ offset: true, error: "Choose a valid deadline." })),
    applicationUrl: optional(httpsUrl),
  })
  .strict();

export type RecruitmentInput = z.infer<typeof recruitmentSchema>;

const postFields = {
  title: optional(z.string().trim().min(3, "Use at least 3 characters.").max(POST_TITLE_MAX, `Use at most ${POST_TITLE_MAX} characters.`)),
  /** Rich text (HTML) for updates and recruitment posts; plain text for stories. */
  body: z.string().max(100_000, "The post is too long."),
  visibility: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"),
  recruitment: recruitmentSchema.optional(),
  /** true publishes now; false keeps (or saves) a draft. Stories are always published at once. */
  publish: z.boolean().default(true),
};

export const createPostSchema = z.object({ type: z.enum(["UPDATE", "RECRUITMENT", "STORY"]), ...postFields }).strict();
export const updatePostSchema = z.object(postFields).strict();

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/** Field errors as { field: message }, first message per top-level field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path[0] === "links" || path[0] === "recruitment" ? (path[1] ?? path[0]) : (path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return fields;
}
