"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonStyles, inputStyles } from "@/components/ui";
import { editMaterialAction, type EditMaterialState } from "../actions";

/**
 * Editing a material's name and text, with the text as students will read it
 * beside it on a wide screen (feedback 8697eb90, after MakeTheCase's and
 * Quizzer's side-by-side editors). Save keeps it; Cancel leaves it as it was.
 */
export function MaterialEditor({
  courseId,
  id,
  name: initialName,
  body: initialBody,
  cancel,
  notes,
  nameMax,
  previewLabel,
}: {
  courseId: string;
  id: string;
  name: string;
  body: string;
  cancel: string;
  notes: string[];
  nameMax: number;
  previewLabel: string;
}) {
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialBody);
  const [state, action, pending] = useActionState<EditMaterialState, FormData>(editMaterialAction, {});
  const changed = name !== initialName || body !== initialBody;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="id" value={id} />
      {notes.map((n) => (
        <p key={n} className="rounded-control border border-border bg-subtle px-3 py-2 text-sm">
          {n}
        </p>
      ))}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={nameMax} required className={`${inputStyles} font-normal`} />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Text
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={24}
            className={`${inputStyles} min-h-80 font-mono text-[13px] leading-relaxed font-normal`}
          />
        </label>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">{previewLabel}</span>
          <div className="max-h-[38rem] min-h-80 overflow-y-auto rounded-panel border border-border bg-surface px-5 py-4">
            <h3 className="mb-3 font-display text-lg font-semibold break-words">{name || "Untitled"}</h3>
            <div className="text-[1.0625rem] leading-relaxed break-words whitespace-pre-wrap">{body}</div>
          </div>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !changed}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Link href={cancel} className={buttonStyles.secondary}>
          Cancel
        </Link>
        <span className="text-sm text-muted tabular-nums">{body.length.toLocaleString("en-US")} characters</span>
      </div>
    </form>
  );
}
