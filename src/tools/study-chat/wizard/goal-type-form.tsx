"use client";

import {
  ChalkboardTeacher,
  ChatsCircle,
  LinkSimple,
  Lightbulb,
  Question,
  Scales,
  ShieldCheck,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { editTypeAction, goalForTypeAction, wizardTypeAction, type TypeState } from "../actions";
import { AssistButton } from "../assist-button";
import { PickerField } from "../forms";
import type { ModeSlug } from "../modes";
import type { TypeSuggestion } from "../suggest";
import { WIZARD_FORM_ID } from "./steps";
import { reasonField } from "./type-request";
import { groupOf, styleLabel, TYPE_GROUPS, type TypeGroup } from "./types";

/** A picture for each kind, so the seven are easy to tell apart at a glance. */
const ICONS: Record<string, Icon> = {
  explain: ChalkboardTeacher,
  apply: Lightbulb,
  argue: Scales,
  question: Question,
  practice: ChatsCircle,
  connect: LinkSimple,
  defend: ShieldCheck,
};

/**
 * Step 2: how students will work with the AI first, then what they'll be
 * able to do by the end, which follows the kind (Nathan, feedback 084938dc:
 * interaction, then outcome and evaluation). Every kind is on screen, each
 * saying what students do and who the AI is; the suggested one leads. The
 * goal box starts empty (Lucy, feedback 78c8594e): the teacher writes it, or
 * presses Draft for one written for the chosen kind, or Tweak to have DALAA
 * rewrite theirs; it never changes on its own. Next saves the chat and
 * opens step 3, where the teacher writes the rest or asks DALAA to.
 */
export function GoalTypeForm({
  courseId,
  creationKey,
  addToCanvas,
  contentIds,
  guideIds,
  kept,
  suggested,
  back,
  activityId,
  from = null,
}: {
  courseId: string;
  creationKey: string;
  addToCanvas: string | null;
  contentIds: string[];
  guideIds: string[];
  /** The teacher's own goal, coming back to this step; NULL to start empty. */
  kept: string | null;
  /** The AI's kinds, best first, each with why it fits and its goal (never empty). */
  suggested: TypeSuggestion[];
  back: string;
  /** On a saved activity (feedback 21e8c594): its current kind leads, and Next saves it in place. */
  activityId?: string;
  /** The course the teacher opened the activity from (checked), kept through its saves (feedback 12b101b4). */
  from?: string | null;
}) {
  const [state, action, pending] = useActionState<TypeState, FormData>(activityId ? editTypeAction : wizardTypeAction, {});
  const first = suggested[0].mode;
  const keptMode = TYPE_GROUPS.flatMap((g) => g.modes).find((m) => m === state.mode);
  const [group, setGroup] = useState(groupOf(keptMode ?? first).key);
  // Each group's style: the suggested one where the AI picked from it, else the usual one.
  const [styles, setStyles] = useState<Record<string, ModeSlug>>(() =>
    Object.fromEntries(
      TYPE_GROUPS.map((g) => [
        g.key,
        (keptMode && g.modes.includes(keptMode) ? keptMode : suggested.find((s) => g.modes.includes(s.mode))?.mode) ?? g.modes[0],
      ]),
    ),
  );
  const mode = styles[group];

  // Goals the first suggestion wrote for each kind: Draft uses one at once, without asking again.
  const drafted = new Map(suggested.flatMap((s) => (s.goal ? [[s.mode, s.goal] as const] : [])));
  // The box starts empty (feedback 78c8594e): the teacher writes the goal, or asks DALAA to draft or tweak it.
  const [goal, setGoal] = useState(kept ?? "");
  const [writing, setWriting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);

  const assist = (instruction: string) => {
    setAssistError(null);
    const current = goal.trim();
    if (current === "" && drafted.has(mode)) {
      setGoal(drafted.get(mode)!);
      return;
    }
    setWriting(true);
    goalForTypeAction(courseId, contentIds, guideIds, mode, current === "" ? undefined : { current, instruction })
      .catch(() => null)
      .then((written) => {
        if (written) setGoal(written);
        else setAssistError("That didn't work this time. Try again, or write it yourself.");
      })
      .finally(() => setWriting(false));
  };

  if (pending) {
    return (
      <section role="status" className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-6">
        <h3 className="font-display text-lg font-semibold">Saving your chat…</h3>
      </section>
    );
  }

  const reasonOf = (g: TypeGroup) => suggested.find((s) => g.modes.includes(s.mode))?.reason ?? null;
  const lead = groupOf(first);
  const others = TYPE_GROUPS.filter((g) => g.key !== lead.key);
  const chosen = TYPE_GROUPS.find((g) => g.key === group)!;

  const card = (g: TypeGroup, leading: boolean) => {
    const checked = g.key === group;
    const Icon = ICONS[g.key];
    const reason = reasonOf(g);
    return (
      <li key={g.key} className={leading ? "sm:col-span-2" : ""}>
        <label className="flex h-full cursor-pointer gap-3 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:ring-1 has-[:checked]:ring-accent">
          <input type="radio" name="group" value={g.key} checked={checked} onChange={() => setGroup(g.key)} className="sr-only" />
          <span aria-hidden className={`mt-0.5 shrink-0 ${checked ? "text-accent" : "text-muted"}`}>
            <Icon size={28} weight={checked ? "fill" : "regular"} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 font-bold">
              {g.label}
              {leading && (
                <span className="rounded-control bg-accent px-2 py-0.5 text-xs font-bold text-white">
                  {activityId ? "Current kind" : "Suggested based on your reading"}
                </span>
              )}
              {checked && <span className="text-xs font-bold text-accent-text">✓ Chosen</span>}
            </span>
            <span className="text-sm">{g.does}</span>
            <span className="text-sm text-muted">{g.ai}</span>
            {reason && leading && <span className="mt-1 text-sm text-text italic">Why it fits: {reason}</span>}
            {g.modes.length > 1 && checked && (
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Style:</span>
                {g.modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setStyles((s) => ({ ...s, [g.key]: m }));
                    }}
                    aria-pressed={styles[g.key] === m}
                    className={`rounded-full border px-3 py-0.5 ${
                      styles[g.key] === m ? "border-accent bg-accent text-white" : "border-border-strong bg-surface text-accent-text hover:bg-subtle"
                    }`}
                  >
                    {styleLabel(m)}
                  </button>
                ))}
              </span>
            )}
          </span>
        </label>
      </li>
    );
  };

  return (
    <form id={activityId ? WIZARD_FORM_ID : undefined} action={action} className="flex flex-col gap-8">
      <input type="hidden" name="courseId" value={courseId} />
      {activityId && <input type="hidden" name="activityId" value={activityId} />}
      <input type="hidden" name="creationKey" value={creationKey} />
      <PickerField addToCanvas={addToCanvas} from={from} />
      <input type="hidden" name="content" value={contentIds.join(",")} />
      {guideIds.length > 0 && <input type="hidden" name="guide" value={guideIds.join(",")} />}
      <input type="hidden" name="mode" value={mode} />
      {suggested.map((s) => s.reason && s.mode === mode && <input key={s.mode} type="hidden" name={reasonField(s.mode)} value={s.reason} />)}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex flex-col gap-0.5">
          <span className="text-lg font-bold">1. How will students work with the AI?</span>
          <span className="text-sm text-muted">Pick the kind of conversation. Each one says what students do and who the AI is.</span>
        </legend>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {card(lead, true)}
          {others.map((g) => card(g, false))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal" className="flex flex-col gap-0.5">
          <span className="text-lg font-bold">2. What will they be able to do by the end?</span>
          <span className="text-sm text-muted">The learning goal. DALAA builds the grading on step 4 from it.</span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
          When students finish, they should be able to…
          <AssistButton name="Learning goal" empty={goal.trim() === ""} busy={writing} disabled={false} error={assistError} onRun={assist} />
        </div>
        <textarea
          id="goal"
          name="goal"
          rows={4}
          required
          maxLength={1000}
          value={goal}
          readOnly={writing}
          onChange={(e) => setGoal(e.target.value)}
          className={`${inputStyles} field-sizing-content min-h-24`}
        />
        <p role="status" className="text-sm text-muted">
          {writing
            ? `Writing a goal for ${chosen.label}…`
            : goal.trim() === ""
              ? `Write it in a sentence or two, or press Draft and I'll write one for ${chosen.label} from your reading.`
              : "Edit it until it says what you want, or press Tweak and tell me what to change."}
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Link href={back} className="text-sm whitespace-nowrap text-muted hover:text-text">
          ← Back
        </Link>
        <span className="flex-1" />
        <Button type="submit" name="intent" value="next" disabled={writing}>
          Next
        </Button>
      </div>
    </form>
  );
}
