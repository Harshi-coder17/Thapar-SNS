"use client";

// FR-ARC-1: submit a project for review (title, description, GitHub link, tags, up to 5 screenshots).
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

import { FileUpload, type UploadedFile } from "../../_components/file-upload";
import { Field, fieldAria, FormAlert, TextInput } from "../../_components/form-fields";
import { RichTextEditor } from "../../_components/rich-text-editor";

export function SubmitForm({ maxShots, maxTags }: { maxShots: number; maxTags: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [tags, setTags] = useState("");
  const [shots, setShots] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="max-w-3xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await callApi<{ project: { id: string } }>("POST", "/api/archive", {
          title,
          description,
          githubUrl,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          screenshotAssetIds: shots.map((s) => s.assetId),
        });
        setPending(false);
        if (!result.ok) {
          setErrors(result.fields);
          setMessage(Object.keys(result.fields).length ? "Check the highlighted fields." : result.message);
          return;
        }
        router.push(`/archive/${result.data.project.id}`);
        router.refresh();
      }}
    >
      <FormAlert message={message} />
      <Field id="title" label="Project title" error={errors.title}>
        <TextInput id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required {...fieldAria("title", errors.title)} />
      </Field>
      <div>
        <p id="description-label" className="text-sm font-medium text-ink">
          Description
        </p>
        <RichTextEditor id="description" labelId="description-label" initialHtml="" onChange={setDescription} describedBy={errors.description ? "description-error" : undefined} invalid={!!errors.description} />
        {errors.description ? (
          <p id="description-error" className="mt-1 text-sm text-brand">
            {errors.description}
          </p>
        ) : null}
      </div>
      <Field id="githubUrl" label="GitHub repository" hint="https://github.com/owner/repository" error={errors.githubUrl}>
        <TextInput id="githubUrl" type="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} required {...fieldAria("githubUrl", errors.githubUrl, true)} />
      </Field>
      <Field id="tags" label={`Tags (comma separated, up to ${maxTags})`} hint="For example: react, machine-learning, iot" error={errors.tags}>
        <TextInput id="tags" value={tags} onChange={(e) => setTags(e.target.value)} {...fieldAria("tags", errors.tags, true)} />
      </Field>
      <div className="space-y-2">
        {shots.length < maxShots ? <FileUpload purpose="ARCHIVE_SCREENSHOT" accept="image/png,image/jpeg" label={`Screenshots (up to ${maxShots})`} hint="PNG or JPEG, up to 5 MB each." onUploaded={(file) => setShots((list) => [...list, file])} /> : null}
        {errors.screenshotAssetIds ? <p className="text-sm text-brand">{errors.screenshotAssetIds}</p> : null}
        <ul className="flex flex-wrap gap-2">
          {shots.map((s) => (
            <li key={s.assetId} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm text-ink">
              {s.name}
              <button type="button" aria-label={`Remove ${s.name}`} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-canvas" onClick={() => setShots((list) => list.filter((x) => x.assetId !== s.assetId))}>
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Button type="submit" disabled={pending}>
        Submit for review
      </Button>
    </form>
  );
}
