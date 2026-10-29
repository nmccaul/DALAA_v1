"use client";

import { useActionState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { addWorkAction } from "./student-actions";

/** The student's own work, uploaded or pasted before the chat opens. A chosen file wins over pasted text. */
export function WorkForm({ activityId }: { activityId: string }) {
  const [state, action, pending] = useActionState(addWorkAction, {});
  return (
    <section className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold">First, add your work</h2>
        <p className="text-muted">The chat is about your paper, code or plan. You can add it once, so check it&apos;s the right one.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="activityId" value={activityId} />
        <div className="flex flex-col gap-2">
          <label htmlFor="work-file" className="font-medium">
            Upload a file
          </label>
          <p className="-mt-1 text-sm text-muted">A .pdf, .txt or .md file, up to 4 MB.</p>
          <input id="work-file" name="file" type="file" accept=".pdf,.txt,.md" className="text-sm" />
        </div>
        <p className="text-sm text-muted">Or paste it:</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="work-name" className="font-medium">
            Title
          </label>
          <input id="work-name" name="name" placeholder="My essay" autoComplete="off" className={inputStyles} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="work-text" className="font-medium">
            Your work
          </label>
          <textarea id="work-text" name="text" rows={8} className={inputStyles} />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <div>
          <Button disabled={pending}>{pending ? "Reading…" : "Add my work and start"}</Button>
        </div>
      </form>
    </section>
  );
}
