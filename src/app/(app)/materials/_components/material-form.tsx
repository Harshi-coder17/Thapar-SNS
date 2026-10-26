"use client";

// UC-13: upload a file (quarantine-first), then describe it. It is listed once the file is approved.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

import { FileUpload, type UploadedFile } from "../../_components/file-upload";
import { Field, fieldAria, FormAlert, inputClass, TextInput } from "../../_components/form-fields";

export function MaterialForm({ branches, types }: { branches: { code: string; name: string }[]; types: Record<string, string> }) {
  const router = useRouter();
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [form, setForm] = useState({ subjectCode: "", title: "", description: "", type: "NOTES", semester: "1", branchCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));
  return (
    <form
      className="max-w-3xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) {
          setMessage("Upload the file first.");
          return;
        }
        setPending(true);
        const result = await callApi("POST", "/api/materials", { ...form, semester: Number(form.semester), assetId: file.assetId });
        setPending(false);
        if (!result.ok) {
          setErrors(result.fields);
          setMessage(Object.keys(result.fields).length ? "Check the highlighted fields." : result.message);
          return;
        }
        router.push("/materials?view=mine");
        router.refresh();
      }}
    >
      <FormAlert message={message} />
      <FileUpload purpose="STUDY_MATERIAL" accept="application/pdf,image/png,image/jpeg" label="File" hint="PDF up to 20 MB, or a PNG or JPEG image up to 5 MB. Every file is checked before it is listed." waitForApproval onUploaded={setFile} />
      {file ? <p className="text-sm text-ink">Uploaded: {file.name}</p> : null}
      {errors.assetId ? <p className="text-sm text-brand">{errors.assetId}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="subjectCode" label="Subject code" hint="For example UCS503." error={errors.subjectCode}>
          <TextInput id="subjectCode" value={form.subjectCode} onChange={set("subjectCode")} maxLength={10} required {...fieldAria("subjectCode", errors.subjectCode, true)} />
        </Field>
        <Field id="type" label="Type" error={errors.type}>
          <select id="type" className={inputClass} value={form.type} onChange={set("type")}>
            {Object.entries(types).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="semester" label="Semester" error={errors.semester}>
          <select id="semester" className={inputClass} value={form.semester} onChange={set("semester")}>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </Field>
        <Field id="branchCode" label="Branch" error={errors.branchCode}>
          <select id="branchCode" className={inputClass} value={form.branchCode} onChange={set("branchCode")} required>
            <option value="">Choose…</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="title" label="Title" error={errors.title}>
        <TextInput id="title" value={form.title} onChange={set("title")} maxLength={150} required {...fieldAria("title", errors.title)} />
      </Field>
      <Field id="description" label="Description (optional)" error={errors.description}>
        <textarea id="description" className={`${inputClass} py-2`} rows={3} maxLength={1000} value={form.description} onChange={set("description")} />
      </Field>
      <Button type="submit" disabled={pending || !file}>
        Share material
      </Button>
    </form>
  );
}
