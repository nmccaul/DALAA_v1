"use client";

import { useActionState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { GUIDE_LABEL } from "@/content/guide-label";
import { PICKER_PARAM } from "@/lti/picker";
import { draftAction, removeGuideAction, saveMaterialAction, type FormState } from "./actions";
import type { Mode } from "./modes";
import { settingTitle } from "./schema";

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
 * `guideFor` (the saved material's id, on create) or `guideOf` (an activity's
 * id, on its review) it takes the AI-only guide instead.
 */
export function MaterialForm({
  courseId,
  creationKey,
  addToCanvas,
  guideFor = null,
  guideOf = null,
}: {
  courseId: string;
  creationKey: string;
  addToCanvas: string | null;
  guideFor?: string | null;
  guideOf?: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMaterialAction, {});
  const guide = Boolean(guideFor || guideOf);
  const id = (name: string) => (guide ? `guide-${name}` : name);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      {guideFor ? <input type="hidden" name="guideFor" value={guideFor} /> : null}
      {guideOf ? <input type="hidden" name="guideOf" value={guideOf} /> : null}
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
        <input id={id("name")} name="name" placeholder={guide ? "Harbor Bikes answer key" : "Case: Harbor Bikes"} autoComplete="off" className={inputStyles} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={id("text")} className="font-medium">
          {guide ? `${GUIDE_LABEL.name} ${GUIDE_LABEL.private}` : "Text students will read"}
        </label>
        <textarea id={id("text")} name="text" rows={8} className={inputStyles} />
      </div>
      <Problem state={state} />
      <div>
        <Button variant={guide ? "secondary" : undefined} disabled={pending}>
          {pending ? "Reading…" : guide ? "Add these instructions" : "Use this material"}
        </Button>
      </div>
    </form>
  );
}

/** Takes the AI-only guide off an activity, from its review screen. */
export function RemoveGuideForm({ courseId, activityId, addToCanvas }: { courseId: string; activityId: string; addToCanvas: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeGuideAction, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      <PickerField addToCanvas={addToCanvas} />
      <button disabled={pending} className="text-sm text-muted underline hover:text-text">
        {pending ? "Removing…" : "Remove"}
      </button>
      <Problem state={state} />
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
      <label className="flex items-start gap-3">
        <input type="checkbox" name="studentWork" className="mt-1 shrink-0" />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Students bring their own work</span>
          <span className="text-sm text-muted">Each student adds their paper, code or plan before the chat, and the chat is about it. Defend always asks for it.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="showProgress" className="mt-1 shrink-0" />
        <span className="flex flex-col gap-1">
          <span className="font-medium">{settingTitle(["showProgress"])}</span>
          <span className="text-sm text-muted">As they chat, students see how many of your touchpoints they&apos;ve covered and the position they&apos;ve taken.</span>
        </span>
      </label>
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
