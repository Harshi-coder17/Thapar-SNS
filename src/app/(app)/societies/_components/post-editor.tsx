"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { isoToIstLocal, istLocalToIso } from "@/shared/format";
import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

import { Field, fieldAria, FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { RichTextEditor } from "../../_components/rich-text-editor";

type PostType = "UPDATE" | "RECRUITMENT" | "STORY";

export interface EditablePost {
  id: string;
  type: PostType;
  visibility: "PUBLIC" | "MEMBERS";
  title: string | null;
  body: string;
  rolesSought: string[];
  eligibleYears: number[];
  eligibleBranchCodes: string[];
  deadline: string | null;
  applicationUrl: string | null;
  published: boolean;
}

interface Props {
  society: { id: string; slug: string };
  /** Where to go after saving (the society workspace). */
  returnTo: string;
  branches: { code: string; name: string }[];
  limits: { title: number; body: number; story: number; roles: number };
  /** Present when editing an existing post. */
  post?: EditablePost;
}

const TYPE_LABELS: Record<PostType, { label: string; hint: string }> = {
  UPDATE: { label: "Update", hint: "News and announcements." },
  RECRUITMENT: { label: "Recruitment drive", hint: "Roles you are recruiting for, who can apply and by when." },
  STORY: { label: "Story", hint: "A short public note that disappears after 24 hours." },
};

/** FR-SOC-3: Heads write updates, recruitment drives and stories (OI-11 fields), published as the society. */
export function PostEditor({ society, returnTo, branches, limits, post }: Props) {
  const router = useRouter();
  const [type, setType] = useState<PostType>(post?.type ?? "UPDATE");
  const [body, setBody] = useState(post?.type === "STORY" ? "" : (post?.body ?? ""));
  const [story, setStory] = useState(post?.type === "STORY" ? post.body : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = post !== undefined;

  async function submit(element: HTMLFormElement, publish: boolean) {
    const form = new FormData(element);
    const text = (key: string) => String(form.get(key) ?? "");
    const payload: Record<string, unknown> =
      type === "STORY"
        ? { body: story, publish: true }
        : {
            title: text("title"),
            body,
            visibility: text("visibility") || "PUBLIC",
            publish,
            ...(type === "RECRUITMENT"
              ? {
                  recruitment: {
                    rolesSought: text("rolesSought")
                      .split(/[\n,]/)
                      .map((role) => role.trim())
                      .filter(Boolean),
                    eligibleYears: form.getAll("eligibleYears").map(Number),
                    eligibleBranchCodes: form.getAll("eligibleBranchCodes").map(String),
                    deadline: istLocalToIso(text("deadline")),
                    applicationUrl: text("applicationUrl"),
                  },
                }
              : {}),
          };
    setPending(true);
    setErrors({});
    setFormError(null);
    const result = editing
      ? await callApi("PATCH", `/api/societies/${society.id}/posts/${post.id}`, payload)
      : await callApi<{ post: { id: string } }>("POST", `/api/societies/${society.id}/posts`, { type, ...payload });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fields);
      if (Object.keys(result.fields).length === 0 || result.fields.form) setFormError(result.fields.form ?? result.message);
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  const recruitment = post?.type === "RECRUITMENT" ? post : null;

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submit(event.currentTarget, true);
      }}
      noValidate className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
      {editing ? null : (
        <fieldset>
          <legend className="text-sm font-medium text-ink">Type</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(TYPE_LABELS) as PostType[]).map((key) => (
              <label
                key={key}
                className={`flex min-h-11 cursor-pointer flex-col rounded-lg border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${type === key ? "border-brand bg-accent" : "border-line"}`}
              >
                <span className="flex items-center gap-2 font-medium text-ink">
                  <input type="radio" name="type" value={key} checked={type === key} onChange={() => setType(key)} className="accent-brand" />
                  {TYPE_LABELS[key].label}
                </span>
                <span className="mt-1 text-xs text-muted">{TYPE_LABELS[key].hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {type === "STORY" ? (
        <Field id="story" label="Story" hint={`${story.length} of ${limits.story} characters. Visible to everyone for 24 hours.`} error={errors.body}>
          <textarea
            id="story"
            value={story}
            onChange={(event) => setStory(event.target.value)}
            maxLength={limits.story}
            rows={4}
            required
            className={`${inputClass} py-2`}
            {...fieldAria("story", errors.body, true)}
          />
        </Field>
      ) : (
        <>
          <Field id="title" label="Title" error={errors.title}>
            <TextInput id="title" name="title" required maxLength={limits.title} defaultValue={post?.title ?? ""} {...fieldAria("title", errors.title)} />
          </Field>
          <div>
            <p id="body-label" className="text-sm font-medium text-ink">
              Post
            </p>
            <RichTextEditor
              id="body"
              labelId="body-label"
              initialHtml={post?.type === "STORY" ? "" : (post?.body ?? "")}
              onChange={setBody}
              describedBy={errors.body ? "body-error" : "body-hint"}
              invalid={!!errors.body}
            />
            <p id="body-hint" className="mt-1 text-xs text-muted">
              Up to {limits.body} characters. Formatting is limited to bold, italic, lists and https links.
            </p>
            {errors.body ? (
              <p id="body-error" className="mt-1 text-sm text-brand">
                {errors.body}
              </p>
            ) : null}
          </div>
          <Field id="visibility" label="Who can see it" error={errors.visibility}>
            <select id="visibility" name="visibility" defaultValue={post?.visibility ?? "PUBLIC"} className={inputClass} {...fieldAria("visibility", errors.visibility)}>
              <option value="PUBLIC">Everyone signed in</option>
              <option value="MEMBERS">Members only</option>
            </select>
          </Field>
        </>
      )}

      {type === "RECRUITMENT" ? (
        <fieldset className="space-y-4 rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">Recruitment details</legend>
          <Field id="rolesSought" label="Roles sought" hint={`One per line or separated by commas, up to ${limits.roles}.`} error={errors.rolesSought}>
            <textarea
              id="rolesSought"
              name="rolesSought"
              rows={3}
              defaultValue={recruitment?.rolesSought.join("\n") ?? ""}
              className={`${inputClass} py-2`}
              {...fieldAria("rolesSought", errors.rolesSought, true)}
            />
          </Field>
          <fieldset aria-describedby="eligibleYears-hint">
            <legend className="text-sm font-medium text-ink">Eligible years</legend>
            <p id="eligibleYears-hint" className="text-xs text-muted">
              Leave all unticked if every year may apply.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((year) => (
                <label key={year} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
                  <input type="checkbox" name="eligibleYears" value={year} defaultChecked={recruitment?.eligibleYears.includes(year)} className="accent-brand" />
                  Year {year}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="eligibleBranchCodes" label="Eligible branches" hint="Leave empty if every branch may apply. Hold Ctrl or Command to choose several." error={errors.eligibleBranchCodes}>
            <select
              id="eligibleBranchCodes"
              name="eligibleBranchCodes"
              multiple
              size={6}
              defaultValue={recruitment?.eligibleBranchCodes ?? []}
              className={`${inputClass} py-2`}
              {...fieldAria("eligibleBranchCodes", errors.eligibleBranchCodes, true)}
            >
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="deadline" label="Application deadline (IST, optional)" error={errors.deadline}>
              <TextInput id="deadline" name="deadline" type="datetime-local" defaultValue={recruitment?.deadline ? isoToIstLocal(new Date(recruitment.deadline)) : ""} {...fieldAria("deadline", errors.deadline)} />
            </Field>
            <Field id="applicationUrl" label="Application link (optional)" error={errors.applicationUrl}>
              <TextInput id="applicationUrl" name="applicationUrl" type="url" placeholder="https://" defaultValue={recruitment?.applicationUrl ?? ""} {...fieldAria("applicationUrl", errors.applicationUrl)} />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <FormAlert message={formError} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : type === "STORY" ? "Post story" : editing && post.published ? "Save changes" : "Publish"}
        </Button>
        {type !== "STORY" && !(editing && post.published) ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) void submit(form, false);
            }}
          >
            Save as draft
          </Button>
        ) : null}
      </div>
    </form>
  );
}
