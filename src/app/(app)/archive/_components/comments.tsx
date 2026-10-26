"use client";

// FR-ARC-3 / OI-23: threaded comments, replies up to 3 levels deep.
import { useState } from "react";

import type { CommentNode } from "@/modules/archive";
import { Button } from "@/shared/ui/button";

import { FormAlert } from "../../_components/form-fields";
import { ReportButton } from "../../_components/report-button";
import { useApiAction } from "../../_components/use-api-action";

const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

function CommentForm({ projectId, parentId, onDone }: { projectId: string; parentId?: string; onDone?: () => void }) {
  const { run, pending, error } = useApiAction();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run("POST", `/api/archive/${projectId}/comments`, { body, ...(parentId ? { parentId } : {}) });
        if (result.ok) {
          setBody("");
          onDone?.();
        }
      }}
    >
      <FormAlert message={error} />
      <label htmlFor={`c-${parentId ?? "root"}`} className="sr-only">
        {parentId ? "Reply" : "Comment"}
      </label>
      <textarea id={`c-${parentId ?? "root"}`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required rows={2} className="block w-full rounded-lg border border-line bg-surface p-2.5 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none" placeholder={parentId ? "Write a reply" : "Write a comment"} />
      <Button type="submit" disabled={pending}>
        {parentId ? "Reply" : "Comment"}
      </Button>
    </form>
  );
}

function Comment({ node, projectId, maxDepth }: { node: CommentNode; projectId: string; maxDepth: number }) {
  const [replying, setReplying] = useState(false);
  const { run, pending } = useApiAction();
  return (
    <li className="space-y-2">
      <div className="rounded-lg border border-line bg-surface p-3">
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">{node.authorName ?? "Former user"}</span> · {when.format(new Date(node.createdAt))}
        </p>
        <p className="mt-1 text-sm whitespace-pre-line text-ink">{node.hidden ? <em className="text-muted">This comment was removed.</em> : node.body}</p>
        {!node.hidden ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {node.depth < maxDepth ? (
              <Button type="button" variant="ghost" onClick={() => setReplying((r) => !r)}>
                Reply
              </Button>
            ) : null}
            {node.mine ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => void run("DELETE", `/api/archive/${projectId}/comments/${node.id}`)}>
                Delete
              </Button>
            ) : (
              <ReportButton targetType="ARCHIVE_COMMENT" targetId={node.id} />
            )}
          </div>
        ) : null}
      </div>
      {replying ? (
        <div className="ml-4">
          <CommentForm projectId={projectId} parentId={node.id} onDone={() => setReplying(false)} />
        </div>
      ) : null}
      {node.replies.length ? (
        <ul className="ml-4 space-y-2 border-l border-line pl-3">
          {node.replies.map((child) => (
            <Comment key={child.id} node={child} projectId={projectId} maxDepth={maxDepth} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function Comments({ projectId, comments, maxDepth }: { projectId: string; comments: CommentNode[]; maxDepth: number }) {
  return (
    <div className="space-y-4">
      <CommentForm projectId={projectId} />
      {comments.length === 0 ? <p className="text-sm text-muted">No comments yet.</p> : null}
      <ul className="space-y-3">
        {comments.map((node) => (
          <Comment key={node.id} node={node} projectId={projectId} maxDepth={maxDepth} />
        ))}
      </ul>
    </div>
  );
}
