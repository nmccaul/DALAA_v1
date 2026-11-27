"use client";

import { Trash } from "@phosphor-icons/react";
import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

export type DeleteState = { error?: string };

/**
 * A trash button that asks first (feedback 2a78bb40, 13e17f3f, D-041): it
 * opens a dialog saying what goes, and only the dialog's red Delete sends
 * `action` (with `fields` as hidden inputs). With `mustTick`, Delete waits
 * for that box (sent as `confirmed=1`). With `blocked`, the dialog says why
 * it can't be deleted instead of asking. With `label`, the button is that
 * small text instead of a trash icon.
 */
export function ConfirmDelete({
  action,
  fields,
  name,
  children,
  mustTick,
  blocked,
  label,
}: {
  action: (state: DeleteState, form: FormData) => Promise<DeleteState>;
  fields: Record<string, string>;
  /** What's being deleted, as the teacher knows it. */
  name: string;
  /** What deleting it means, in a sentence or two. */
  children?: ReactNode;
  mustTick?: string;
  blocked?: string;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ticked, setTicked] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  const titleId = useId();

  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          className="shrink-0 text-sm whitespace-nowrap text-muted underline hover:text-danger"
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          aria-label={`Delete ${name}`}
          title="Delete"
          className="grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash size={18} aria-hidden />
        </button>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setTicked(false)}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
      >
        <form action={formAction} className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="font-display text-xl font-semibold break-words">
            {blocked ? `"${name}" can't be deleted yet` : `Delete "${name}"?`}
          </h2>
          <div className="flex flex-col gap-2">{blocked ? <p>{blocked}</p> : children}</div>
          {!blocked && mustTick && (
            <label className="flex items-start gap-2.5 rounded-control border border-danger/40 bg-danger-soft px-3 py-2.5">
              <input
                type="checkbox"
                name="confirmed"
                value="1"
                checked={ticked}
                onChange={(e) => setTicked(e.target.checked)}
                className="mt-1 size-4 shrink-0 accent-danger"
              />
              <span>{mustTick}</span>
            </label>
          )}
          {state.error && (
            <p role="alert" className="text-danger">
              {state.error}
            </p>
          )}
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="flex flex-wrap justify-end gap-2">
            {/* Cancel takes the focus, so Enter right after opening never deletes. */}
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()} autoFocus>
              {blocked ? "Close" : "Cancel"}
            </Button>
            {!blocked && (
              <Button type="submit" variant="danger" disabled={pending || (mustTick !== undefined && !ticked)}>
                {pending ? "Deleting…" : "Delete"}
              </Button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
