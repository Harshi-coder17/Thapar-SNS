"use client";

// UC-10 steps 2 to 6: create a teammate request. The server validates and sanitises again.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { SESSION_ENDING_EVENT } from "@/shared/layout/session-guard";

import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

import { Field, fieldAria, FormAlert, inputClass, TextInput } from "../../_components/form-fields";
import { RichTextEditor } from "../../_components/rich-text-editor";

const DRAFT_KEY = "thapar-sns:mate-request-draft";

interface Draft {
  title: string;
  description: string;
  type: string;
  subject: string;
  skills: string[];
  teamSize: string;
  expiresAt: string;
}

const noSubscription = () => () => undefined;
const readDraft = () => {
  try {
    return sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
};

function parseDraft(saved: string | null): Partial<Draft> | null {
  try {
    return saved ? (JSON.parse(saved) as Partial<Draft>) : null;
  } catch {
    return null;
  }
}

type FormProps = { tags: { slug: string; label: string }[]; maxSkills: number; maxDays: number; defaultExpiry: string };

/**
 * UC-10 E2: if the session expired while writing, the draft is kept for this browser tab only
 * (sessionStorage, never tokens) and restored when the student comes back after signing in again.
 */
export function MateForm(props: FormProps) {
  const saved = useSyncExternalStore(noSubscription, readDraft, () => null);
  const draft = parseDraft(saved);
  return <MateFormFields key={draft ? "restored" : "new"} {...props} draft={draft} />;
}

function MateFormFields({ tags, maxSkills, maxDays, defaultExpiry, draft }: FormProps & { draft: Partial<Draft> | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [type, setType] = useState(draft?.type ?? "PROJECT");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [skills, setSkills] = useState<string[]>(Array.isArray(draft?.skills) ? draft.skills : []);
  const [teamSize, setTeamSize] = useState(draft?.teamSize ?? "4");
  const [expiresAt, setExpiresAt] = useState(draft?.expiresAt ?? defaultExpiry);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Session policy: if the session ends while this form is open (warning timeout, another tab, a 401),
  // keep what was typed for this tab and restore it after signing in again (UC-10 E2).
  const latestRef = useRef({ title, description, type, subject, skills, teamSize, expiresAt });
  useEffect(() => {
    latestRef.current = { title, description, type, subject, skills, teamSize, expiresAt };
  });
  useEffect(() => {
    const keep = () => {
      const draft = latestRef.current;
      if (!draft.title.trim() && !draft.description.trim()) return;
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // nothing to keep the draft in
      }
    };
    window.addEventListener(SESSION_ENDING_EVENT, keep);
    return () => window.removeEventListener(SESSION_ENDING_EVENT, keep);
  }, []);
  return (
    <form
      className="max-w-3xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(null);
        const result = await callApi<{ request: { id: string } }>("POST", "/api/mates", { title, description, type, subject, skills, teamSize: Number(teamSize), expiresAt: `${expiresAt}T23:59:00+05:30` }, { handleUnauthorized: true });
        setPending(false);
        if (!result.ok && result.status === 401) {
          try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, type, subject, skills, teamSize, expiresAt }));
          } catch {
            // nothing to keep the draft in; the student re-enters it
          }
          router.push("/login?reason=expired");
          return;
        }
        if (!result.ok) {
          setErrors(result.fields);
          setMessage(Object.keys(result.fields).length ? "Check the highlighted fields." : result.message);
          return;
        }
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          // nothing stored
        }
        router.push(`/mates/${result.data.request.id}`);
        router.refresh();
      }}
    >
      <FormAlert message={message} />
      {draft ? (
        <p role="status" className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          Your unsaved request was restored after you signed in again.
        </p>
      ) : null}
      <Field id="title" label="Title" error={errors.title}>
        <TextInput id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required {...fieldAria("title", errors.title)} />
      </Field>
      <div>
        <p id="description-label" className="text-sm font-medium text-ink">
          What are you looking for?
        </p>
        <RichTextEditor id="description" labelId="description-label" initialHtml={draft?.description ?? ""} onChange={setDescription} describedBy={errors.description ? "description-error" : undefined} invalid={!!errors.description} />
        {errors.description ? (
          <p id="description-error" className="mt-1 text-sm text-brand">
            {errors.description}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="type" label="Type" error={errors.type}>
          <select id="type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="HACKATHON">Hackathon</option>
            <option value="PROJECT">Project</option>
            <option value="CASUAL">Casual</option>
          </select>
        </Field>
        <Field id="subject" label="Subject (optional)" hint="For example a course code such as UCS503." error={errors.subject}>
          <TextInput id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={60} {...fieldAria("subject", errors.subject, true)} />
        </Field>
        <Field id="teamSize" label="Team size (including you)" error={errors.teamSize}>
          <TextInput id="teamSize" type="number" min={2} max={10} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} required {...fieldAria("teamSize", errors.teamSize)} />
        </Field>
        <Field id="expiresAt" label="Open until" hint={`At most ${maxDays} days from today.`} error={errors.expiresAt}>
          <TextInput id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required {...fieldAria("expiresAt", errors.expiresAt, true)} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink">Skills needed (1 to {maxSkills})</legend>
        {errors.skills ? <p className="text-sm text-brand">{errors.skills}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => {
            const on = skills.includes(tag.slug);
            return (
              <label key={tag.slug} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${on ? "border-brand bg-accent text-accent-foreground" : "border-line bg-surface text-ink"}`}>
                <input type="checkbox" className="size-4" checked={on} disabled={!on && skills.length >= maxSkills} onChange={(e) => setSkills((list) => (e.target.checked ? [...list, tag.slug] : list.filter((s) => s !== tag.slug)))} />
                {tag.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>
        Post request
      </Button>
    </form>
  );
}
