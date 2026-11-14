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
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button, inputStyles } from "@/components/ui";
import { goalForTypeAction, wizardTypeAction, type TypeState } from "../actions";
import { PickerField } from "../forms";
import type { ModeSlug } from "../modes";
import type { TypeSuggestion } from "../suggest";
import { MINUTES, type Minutes } from "./query";
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
 * goal is written for the chosen kind: switching kinds brings that kind's
 * goal (asking the AI when the first suggestion had none), unless the teacher
 * has written their own, which is never replaced. Next drafts the chat.
 */
export function GoalTypeForm({
  courseId,
  creationKey,
  addToCanvas,
  contentIds,
  guideIds,
  kept,
  minutes,
  suggested,
  back,
}: {
  courseId: string;
  creationKey: string;
  addToCanvas: string | null;
  contentIds: string[];
  guideIds: string[];
  /** The teacher's own goal, coming back to this step; NULL to use the suggestions. */
  kept: string | null;
  minutes: Minutes | null;
  /** The AI's kinds, best first, each with why it fits and its goal (never empty). */
  suggested: TypeSuggestion[];
  back: string;
}) {
  const [state, action, pending] = useActionState<TypeState, FormData>(wizardTypeAction, {});
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

  // Goals written for each kind so far; the teacher's own goal wins once they type.
  const [goals, setGoals] = useState<ReadonlyMap<ModeSlug, string>>(
    () => new Map(suggested.flatMap((s) => (s.goal ? [[s.mode, s.goal] as const] : []))),
  );
  // The teacher's own goal once they type (or coming back); until then the goal written for the chosen kind.
  const [own, setOwn] = useState<string | null>(kept);
  const edited = own !== null;
  const goal = own ?? goals.get(mode) ?? "";
  const [writing, startWriting] = useTransition();

  const contentKey = contentIds.join(",");
  const guideKey = guideIds.join(",");
  // A kind with no goal yet gets one written for it, unless the teacher has written their own.
  useEffect(() => {
    if (edited || goals.has(mode)) return;
    let current = true;
    startWriting(async () => {
      const written = await goalForTypeAction(courseId, contentKey.split(","), guideKey ? guideKey.split(",") : [], mode);
      if (current && written) setGoals((g) => new Map(g).set(mode, written));
    });
    return () => {
      current = false;
    };
  }, [mode, edited, goals, courseId, contentKey, guideKey]);

  if (pending) {
    return (
      <section role="status" className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-6">
        <h3 className="font-display text-lg font-semibold">DALAA is drafting your chat…</h3>
        <p className="text-muted">
          It&apos;s reading your materials and writing the AI&apos;s role, the opening, the grading and when the chat ends, around your
          goal. This takes up to a minute.
        </p>
      </section>
    );
  }

  const reasonOf = (g: TypeGroup) => suggested.find((s) => g.modes.includes(s.mode))?.reason ?? null;
  const lead = groupOf(first);
  const others = TYPE_GROUPS.filter((g) => g.key !== lead.key);
  const chosen = TYPE_GROUPS.find((g) => g.key === group)!;
  const showing = !edited && goals.has(mode);

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
              {leading && <span className="rounded-control bg-accent px-2 py-0.5 text-xs font-bold text-white">Suggested based on your reading</span>}
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
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      <PickerField addToCanvas={addToCanvas} />
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
        <div className="flex items-baseline gap-2 text-sm font-medium">When students finish, they should be able to…</div>
        <textarea
          id="goal"
          name="goal"
          rows={4}
          required
          maxLength={1000}
          value={goal}
          onChange={(e) => setOwn(e.target.value)}
          className={`${inputStyles} field-sizing-content min-h-24`}
        />
        <p role="status" className="text-sm text-muted">
          {writing && !edited
            ? `Writing a goal for ${chosen.label}…`
            : edited
              ? "Your goal. It stays as you wrote it if you change the kind above."
              : showing
                ? `Written for ${chosen.label}, based on your reading. Edit it until it says what you want.`
                : "Write it in a sentence or two."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="minutes" className="flex flex-col gap-0.5">
          <span className="text-lg font-bold">3. About how long?</span>
          <span className="text-sm text-muted">DALAA sizes the chat to fit. You can set exact limits in Chat options.</span>
        </label>
        <select id="minutes" name="minutes" defaultValue={minutes ?? "10-15"} className={`${inputStyles} sm:max-w-xs`}>
          {MINUTES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
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
        <Button type="submit" disabled={writing && !edited}>
          Draft the chat
        </Button>
      </div>
    </form>
  );
}
