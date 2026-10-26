"use client";

import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { useEffect, useRef } from "react";

import { sanitizeForEditor } from "@/shared/security/editor-html";

// Minimal rich-text editor for society posts: bold, italic, lists and links. It edits HTML in the
// browser, but the browser is never trusted: the server sanitises every body with an allow-list
// (src/shared/security/sanitize-html.ts) before storing it, so pasted markup cannot inject anything.
// Markup loaded into the editor is also reduced to the same allow-list in the browser (editor-html.ts).
// document.execCommand is deprecated but still supported by every target browser; it keeps this
// editor small and dependency-free.

interface Props {
  id: string;
  labelId: string;
  initialHtml: string;
  onChange: (html: string) => void;
  describedBy?: string;
  invalid?: boolean;
}

const TOOLS = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "insertUnorderedList", label: "Bulleted list", icon: List },
  { command: "insertOrderedList", label: "Numbered list", icon: ListOrdered },
] as const;

export function RichTextEditor({ id, labelId, initialHtml, onChange, describedBy, invalid }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initialHtml);

  // The starting content is set once, after mounting, reduced to the allow-list in the browser too
  // (the server already sanitised what it serves; a restored draft comes from this tab's storage).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeForEditor(initialRef.current);
  }, []);

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    onChange(ref.current?.innerHTML ?? "");
  }

  function addLink() {
    const url = window.prompt("Link address (https://...)", "https://");
    if (!url) return;
    if (!/^https:\/\/\S+$/i.test(url.trim())) {
      window.alert("Use a full https:// link.");
      return;
    }
    exec("createLink", url.trim());
  }

  const buttonClass = "flex size-11 items-center justify-center rounded-md text-ink hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

  return (
    <div className="mt-1 rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-brand aria-[invalid=true]:border-brand" aria-invalid={invalid || undefined}>
      <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex flex-wrap gap-1 border-b border-line p-1">
        {TOOLS.map(({ command, label, icon: Icon }) => (
          <button key={command} type="button" className={buttonClass} aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => exec(command)}>
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
        <button type="button" className={buttonClass} aria-label="Add link" title="Add link" onMouseDown={(event) => event.preventDefault()} onClick={addLink}>
          <Link2 className="size-4" aria-hidden />
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        className="rich-text min-h-40 px-3 py-2 text-base text-ink outline-none"
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
    </div>
  );
}
