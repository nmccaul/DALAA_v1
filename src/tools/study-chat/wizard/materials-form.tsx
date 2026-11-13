"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type MouseEvent } from "react";
import { matchesSearch } from "@/components/search-match";
import { SeenByPill, type SeenBy } from "@/components/seen-by-pill";
import { SOURCE_FILTERS, SOURCE_LABEL, type MaterialSource } from "@/content/material-sources";
import { Button } from "@/components/ui";
import { wizardMaterialsAction, type MaterialsPickState } from "../actions";
import { PickerField } from "../forms";
import { addMaterialPath, savedIds, type AddKind } from "./query";

export type PickRow = { value: string; name: string; source: MaterialSource; seenBy: SeenBy; checked: boolean };

const ADD: { kind: AddKind; label: string }[] = [
  { kind: "upload", label: "Upload a file" },
  { kind: "paste", label: "Paste text" },
  { kind: "web", label: "Add a web page" },
];

/**
 * Step 1: tick what the activity uses. Next saves any ticked Canvas items and
 * goes on to the learning goal. "+ Materials" adds one and comes back here,
 * with the saved materials ticked right now still ticked. Search and Show
 * hide rows without unmounting them, so a ticked row that's filtered out
 * stays ticked and is still sent. Next sits in a bar pinned to the bottom of
 * the screen, so it's never below a long list; below lg it leaves room under
 * Next for the Feedback button (components/feedback.tsx), which floats there.
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
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<MaterialSource | null>(null);
  const [count, setCount] = useState(drawn.length);
  const recount = () => setCount(form.current ? new FormData(form.current).getAll("pick").length : 0);
  // React resets the boxes after the action returns; count what it redrew.
  useEffect(recount, [state]);
  const sources = SOURCE_FILTERS.filter((f) => f.source === null || rows.some((r) => r.source === f.source));
  const visible = (r: PickRow) => (show === null || r.source === show) && matchesSearch(query, r.name);
  const shown = rows.filter(visible).length;
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
        <>
          <div className="flex flex-col gap-3">
            <label className="relative flex w-full items-center sm:w-72">
              <span className="sr-only">Search for material</span>
              <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute left-3 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="Search for material"
                className="w-full rounded-control border border-border-strong bg-surface py-2 pr-3 pl-9 text-text placeholder:text-muted"
              />
            </label>
            {sources.length > 2 && (
              <div role="group" aria-label="Show" className="flex flex-wrap gap-1 text-sm">
                {sources.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    aria-pressed={f.source === show}
                    onClick={() => setShow(f.source)}
                    className={`rounded-full border px-3 py-1 ${
                      f.source === show ? "border-accent bg-accent text-white" : "border-border-strong text-accent-text hover:bg-subtle"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <fieldset className="flex flex-col" onChange={recount}>
            <legend className="sr-only">Materials</legend>
            {rows.map((r) => (
              <label key={r.value} hidden={!visible(r)} className="flex items-start gap-3 border-b border-border px-1 py-3 hover:bg-subtle">
                <input type="checkbox" name="pick" value={r.value} defaultChecked={drawn.includes(r.value)} className="mt-1 size-4 accent-[var(--color-accent)]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold break-words">{r.name}</span>
                  <span className="text-[13px] text-muted">{SOURCE_LABEL[r.source]}</span>
                </span>
                <SeenByPill seenBy={r.seenBy} />
              </label>
            ))}
            {shown === 0 && (
              <p role="status" className="border border-dashed border-border-strong px-6 py-10 text-muted">
                {query.trim() ? <>No materials match &ldquo;{query.trim()}&rdquo;.</> : "Nothing of this kind yet."}
              </p>
            )}
          </fieldset>
        </>
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
      <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-border bg-bg pt-3 pb-16 lg:pb-3">
        <Link href={back} className="text-sm whitespace-nowrap text-muted hover:text-text">
          ← Back
        </Link>
        <span className="flex-1" />
        <span role="status" className="text-sm text-muted">
          {count === 0 ? "None ticked yet" : `${count} ticked`}
        </span>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Next"}
        </Button>
      </div>
    </form>
  );
}
