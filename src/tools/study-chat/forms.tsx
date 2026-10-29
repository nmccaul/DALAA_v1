"use client";

import { useActionState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { PICKER_PARAM } from "@/lti/picker";
import { draftAction, saveMaterialAction, type FormState } from "./actions";
import type { Mode } from "./modes";

function Problem({ state }: { state: FormState }) {
  return state.error ? (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  ) : null;
}

/** Keeps an open "Add to Canvas" picker through the create flow (src/lti/picker.ts). */
export function PickerField({ addToCanvas }: { addToCanvas: string | null }) {
  return addToCanvas ? <input type="hidden" name={PICKER_PARAM} value={addToCanvas} /> : null;
}

/**
 * Paste the material, or upload it. A chosen file wins over pasted text. With
 * `guideFor` (the saved material's id) it takes the AI-only guide instead.
 */
export function MaterialForm({
  courseId,
  creationKey,
  addToCanvas,
  guideFor = null,
}: {
  courseId: string;
  creationKey: string;
  addToCanvas: string | null;
  guideFor?: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMaterialAction, {});
  const id = (name: string) => (guideFor ? `guide-${name}` : name);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      {guideFor ? <input type="hidden" name="guideFor" value={guideFor} /> : null}
      <PickerField addToCanvas={addToCanvas} />
      <div className="flex flex-col gap-2">
        <label htmlFor={id("file")} className="font-medium">
          Upload a file
        </label>
        <p className="-mt-1 text-sm text-muted">A .pdf, .txt or .md file, up to 4 MB.</p>
        <input id={id("file")} name="file" type="file" accept=".pdf,.txt,.md" className="text-sm" />
      </div>
      <p className="text-sm text-muted">Or paste it:</p>
      <div className="flex flex-col gap-2">
        <label htmlFor={id("name")} className="font-medium">
          Title
        </label>
        <input id={id("name")} name="name" placeholder={guideFor ? "Harbor Bikes teaching note" : "Case: Harbor Bikes"} autoComplete="off" className={inputStyles} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={id("text")} className="font-medium">
          {guideFor ? "Text only the AI reads" : "Text students will read"}
        </label>
        <textarea id={id("text")} name="text" rows={8} className={inputStyles} />
      </div>
      <Problem state={state} />
      <div>
        <Button variant={guideFor ? "secondary" : undefined} disabled={pending}>
          {pending ? "Reading…" : guideFor ? "Add this guide" : "Use this material"}
        </Button>
      </div>
    </form>
  );
}

/** The kind of chat: one of the modes, or "Suggest for me". Drafting takes a while, so it says so. */
export function ModeForm({
  courseId,
  contentId,
  guideId,
  creationKey,
  addToCanvas,
  modes,
}: {
  courseId: string;
  contentId: string;
  guideId: string | null;
  creationKey: string;
  addToCanvas: string | null;
  modes: readonly Pick<Mode, "slug" | "label" | "description">[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(draftAction, {});

  if (pending) {
    return (
      <section role="status" className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-6">
        <h3 className="font-display text-lg font-semibold">DALAA is drafting your chat…</h3>
        <p className="text-muted">
          It&apos;s reading your material and writing the goal, scenario, character, ending and rubric. This takes up to
          a minute.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="contentId" value={contentId} />
      {guideId ? <input type="hidden" name="guideId" value={guideId} /> : null}
      <input type="hidden" name="creationKey" value={creationKey} />
      <PickerField addToCanvas={addToCanvas} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-medium">What kind of chat?</legend>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {modes.map((m) => (
            <li key={m.slug}>
              <label className="flex h-full cursor-pointer items-start gap-3 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name="mode" value={m.slug} className="mt-1 shrink-0" />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-sm text-muted">{m.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Problem state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <Button>Draft it</Button>
        <Button variant="secondary" name="mode" value="suggest" formNoValidate>
          Suggest for me
        </Button>
      </div>
    </form>
  );
}
