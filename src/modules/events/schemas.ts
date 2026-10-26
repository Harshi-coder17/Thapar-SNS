// Event request schemas (FR-EVT-1, OI-12 custom registration fields). The server validates every field.
import { z } from "zod";

export const MAX_FIELDS = 10;
export const FIELD_TYPES = ["short_text", "long_text", "single_select", "multi_select", "checkbox", "number"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const registrationFieldSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,29}$/, "Field ids are short lower-case names."),
    label: z.string().trim().min(1, "Give the field a label.").max(80),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  })
  .strict()
  .refine((f) => (f.type === "single_select" || f.type === "multi_select" ? (f.options?.length ?? 0) >= 2 : f.options === undefined), {
    message: "Select fields need at least 2 options; other fields have none.",
  });

export type RegistrationField = z.infer<typeof registrationFieldSchema>;

export const registrationSchemaSchema = z
  .array(registrationFieldSchema)
  .max(MAX_FIELDS, `Use at most ${MAX_FIELDS} fields.`)
  .refine((fields) => new Set(fields.map((f) => f.id)).size === fields.length, { message: "Field ids must be unique." })
  .default([]);

const iso = z.iso.datetime({ offset: true, error: "Choose a valid date and time." });

const eventFields = {
  title: z.string().trim().min(3, "Use at least 3 characters.").max(150, "Use at most 150 characters."),
  /** Rich text; sanitised in the service. */
  description: z.string().max(100_000),
  venue: z.string().trim().min(2, "Enter the venue.").max(200),
  startAt: iso,
  endAt: iso,
  capacity: z.coerce.number().int("Use a whole number.").min(1, "Capacity is at least 1.").max(100_000),
  registrationSchema: registrationSchemaSchema,
};

export const createEventSchema = z
  .object({
    /** The hosting society; omit for a campus event (platform admins only, OI-34). */
    societyId: z.uuid().optional(),
    ...eventFields,
    publish: z.boolean().default(false),
  })
  .strict();

export const updateEventSchema = z.object(eventFields).strict();
export const cancelEventSchema = z.object({ reason: z.string().trim().min(3, "Give a short reason.").max(300) }).strict();
export const interestSchema = z.object({ interested: z.boolean() }).strict();
export const registerSchema = z.object({ responses: z.record(z.string(), z.unknown()).default({}) }).strict();

export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Validates registration answers against the event's stored fields (UC-07 steps 3 and 4). Returns the
 * cleaned answers (only known fields, plain text) or per-field errors.
 */
export function validateResponses(fields: RegistrationField[], raw: Record<string, unknown>): { ok: true; value: Record<string, string | number | boolean | string[]> } | { ok: false; fields: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value: Record<string, string | number | boolean | string[]> = {};
  for (const field of fields) {
    const answer = raw[field.id];
    const empty = answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0);
    if (empty) {
      if (field.required && field.type !== "checkbox") errors[field.id] = "This field is required.";
      if (field.required && field.type === "checkbox") errors[field.id] = "Please tick this box.";
      continue;
    }
    switch (field.type) {
      case "short_text":
      case "long_text": {
        const max = field.type === "short_text" ? 200 : 2000;
        if (typeof answer !== "string") errors[field.id] = "Enter text.";
        else if (answer.trim().length > max) errors[field.id] = `Use at most ${max} characters.`;
        else value[field.id] = answer.trim();
        break;
      }
      case "number": {
        const n = typeof answer === "number" ? answer : Number(answer);
        if (!Number.isFinite(n)) errors[field.id] = "Enter a number.";
        else value[field.id] = n;
        break;
      }
      case "checkbox":
        if (answer !== true && answer !== "true" && answer !== false && answer !== "false") errors[field.id] = "Invalid value.";
        else if (field.required && (answer === false || answer === "false")) errors[field.id] = "Please tick this box.";
        else value[field.id] = answer === true || answer === "true";
        break;
      case "single_select":
        if (typeof answer !== "string" || !field.options?.includes(answer)) errors[field.id] = "Choose one of the options.";
        else value[field.id] = answer;
        break;
      case "multi_select": {
        const list = Array.isArray(answer) ? answer : [answer];
        if (!list.every((item) => typeof item === "string" && field.options?.includes(item))) errors[field.id] = "Choose from the options.";
        else value[field.id] = [...new Set(list as string[])];
        break;
      }
    }
  }
  return Object.keys(errors).length ? { ok: false, fields: errors } : { ok: true, value };
}

/** Field errors as { field: message }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return fields;
}
