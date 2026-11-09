"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, type MouseEvent } from "react";
import { SeenByPill, type SeenBy } from "@/components/seen-by-pill";
import { Button } from "@/components/ui";
import { wizardMaterialsAction, type MaterialsPickState } from "../actions";
import { PickerField } from "../forms";
import { addMaterialPath, savedIds, type AddKind } from "./query";

export type PickRow = { value: string; name: string; source: string; seenBy: SeenBy; checked: boolean };

const ADD: { kind: AddKind; label: string }[] = [
  { kind: "upload", label: "Upload a file" },
  { kind: "paste", label: "Paste text" },
  { kind: "web", label: "Add a web page" },
];

/**
 * Step 1: tick what the activity uses. Next saves any ticked Canvas items and
 * goes on to the learning goal. "+ Materials" adds one and comes back here,
 * with the saved materials ticked right now still ticked.
 */
export function MaterialsPickForm({
  courseId,
  formKey,
  addToCanvas,
  rows,
  back,
}: {
  courseId: string;
  formKey: string;
  addToCanvas: string | null;
  rows: PickRow[];
  back: string;
}) {
  const [state, action, pending] = useActionState<MaterialsPickState, FormData>(wizardMaterialsAction, {});
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const drawn = rows.filter((r) => (state.ticked ? state.ticked.includes(r.value) : r.checked)).map((r) => r.value);
  // The href fits the boxes as drawn; a plain click reads the boxes as they are now.
  const addPath = (kind: AddKind, ticked: string[]) => addMaterialPath(courseId, kind, savedIds(ticked), addToCanvas);
  const follow = (kind: AddKind) => (e: MouseEvent) => {
    if (!form.current || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(addPath(kind, new FormData(form.current).getAll("pick").map(String)));
  };

  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="formKey" value={formKey} />
      <PickerField addToCanvas={addToCanvas} />
      {rows.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-10 text-muted">This course has no materials yet. Add one below.</p>
      ) : (
        <fieldset className="flex flex-col">
          <legend className="sr-only">Materials</legend>
          {rows.map((r) => (
            <label key={r.value} className="flex items-start gap-3 border-b border-border px-1 py-3 hover:bg-subtle">
              <input type="checkbox" name="pick" value={r.value} defaultChecked={drawn.includes(r.value)} className="mt-1 size-4 accent-[var(--color-accent)]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold break-words">{r.name}</span>
                <span className="text-[13px] text-muted">{r.source}</span>
              </span>
              <SeenByPill seenBy={r.seenBy} />
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-bold">+ Materials</span>
        {ADD.map(({ kind, label }) => (
          <Link key={kind} href={addPath(kind, drawn)} onClick={follow(kind)} className="text-accent-text hover:underline">
            {label}
          </Link>
        ))}
        <span aria-disabled className="cursor-not-allowed text-muted">
          Write a new case with Case Writer · Coming soon
        </span>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}{" "}
          {state.reconnect && (
            <Link href={state.reconnect} className="underline">
              Reconnect Canvas
            </Link>
          )}
        </p>
      )}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Link href={back} className="text-sm text-muted hover:text-text">
          ← Back
        </Link>
        <span className="flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Next"}
        </Button>
      </div>
    </form>
  );
}
