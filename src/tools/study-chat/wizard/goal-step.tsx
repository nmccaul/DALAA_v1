import Link from "next/link";
import { graderModel } from "@/ai/models";
import { inputStyles, Button } from "@/components/ui";
import { db } from "@/db/client";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { suggestGoal } from "../suggest";
import { pickedMaterials } from "./picks";
import { goalFromQuery, materialsFromQuery, materialsStepPath, MINUTES } from "./query";
import { WizardShell } from "./shell";

/**
 * Wizard step 2: the learning goal, pre-filled with the AI's suggestion from
 * the ticked materials (a teacher coming back from step 3 sees their own goal
 * instead, and no new suggestion is asked for). Next carries the goal and the
 * length hint on to the type step in the URL (ralph/PLAN.md).
 */
export async function GoalStep({ actor, course, searchParams }: CreateScreenProps) {
  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const ids = materialsFromQuery(searchParams);
  const back = materialsStepPath(course.id, ids, addToCanvas);
  const kept = goalFromQuery(searchParams);
  const materials = await pickedMaterials(db(), actor, course.id, ids);

  if (!materials.ok) {
    return (
      <WizardShell step="goal" title="What should students be able to do?" note={<p>I suggest a goal once the materials are picked.</p>}>
        <p role="alert" className="text-danger">
          {materials.reason}
        </p>
        <Link href={back} className="self-start text-sm text-muted hover:text-text">
          ← Back to materials
        </Link>
      </WizardShell>
    );
  }

  const suggested = kept.goal
    ? null
    : await suggestGoal(db(), graderModel(), { userId: actor.userId, courseId: course.id }, materials);
  const goal = kept.goal ?? (suggested?.ok ? suggested.goal : "");
  const count = materials.readings.length + materials.guides.length;

  return (
    <WizardShell
      step="goal"
      title="What should students be able to do?"
      note={
        kept.goal ? (
          <p>This is the goal you wrote. Change it if you like; I&apos;ll suggest an activity type from it next.</p>
        ) : suggested?.ok ? (
          <p>
            I read your {count === 1 ? "material" : `${count} materials`} and suggested this goal. Edit it until it says what you
            want; I&apos;ll draft the whole chat around it.
          </p>
        ) : (
          <p>Write the goal in a sentence or two. I&apos;ll draft the whole chat around it.</p>
        )
      }
      comingSoon={["Ask the wizard for changes"]}
    >
      <form action={`/courses/${course.id}/activities/new/study-chat`} className="flex flex-col gap-5">
        <input type="hidden" name="step" value="type" />
        <input type="hidden" name="content" value={ids.contentIds.join(",")} />
        {ids.guideIds.length > 0 && <input type="hidden" name="guide" value={ids.guideIds.join(",")} />}
        {addToCanvas && <input type="hidden" name={PICKER_PARAM} value={addToCanvas} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal" className="font-bold">
            When students finish, they should be able to…
          </label>
          <textarea id="goal" name="goal" rows={4} required maxLength={1000} defaultValue={goal} className={inputStyles} />
          {suggested && !suggested.ok && (
            <p className="text-sm text-muted">I couldn&apos;t suggest a goal this time. Write one in a sentence or two.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="minutes" className="font-bold">
            About how long?
          </label>
          <select id="minutes" name="minutes" defaultValue={kept.minutes ?? "20-30"} className={`${inputStyles} sm:max-w-xs`}>
            {MINUTES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {["Activity group", "Start from"].map((label) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="font-bold text-muted">
                {label} <span className="text-xs font-normal">· Coming soon</span>
              </span>
              <select disabled aria-label={`${label} (coming soon)`} className={`${inputStyles} cursor-not-allowed opacity-60`}>
                <option>{label === "Start from" ? "A new activity" : "None"}</option>
              </select>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Link href={back} className="text-sm text-muted hover:text-text">
            ← Back
          </Link>
          <span className="flex-1" />
          <Button type="submit">Next</Button>
        </div>
      </form>
    </WizardShell>
  );
}
