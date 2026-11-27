import { randomUUID } from "node:crypto";
import Link from "next/link";
import { activityMaterials } from "@/activities/materials";
import { graderModel } from "@/ai/models";
import { keepFrom } from "@/courses/origin";
import { db } from "@/db/client";
import { keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { StudyChatSetupSettings } from "../schema";
import { suggestTypes } from "../suggest";
import { GoalTypeForm } from "./goal-type-form";
import { pickedMaterials } from "./picks";
import { goalFromQuery, materialsFromQuery, materialsStepPath } from "./query";
import { WizardShell, type SavedStepProps } from "./shell";
import { setupPath, WIZARD_STEPS } from "./steps";
import { groupOf } from "./types";

const title = WIZARD_STEPS.find((s) => s.slug === "goal")!.question;

/**
 * Wizard step 2: how students will work with the AI, then the learning goal
 * written for that kind, then the length. The kinds and their goals are
 * suggested from the ticked materials in one call (feedback 084938dc: the
 * interaction first, then the outcome); the goal box starts empty, with
 * Draft and Tweak (feedback 78c8594e). Next saves the chat
 * (wizardTypeAction) and opens step 3; nothing more is drafted until the teacher asks.
 */
export async function GoalStep({ actor, course, searchParams }: CreateScreenProps) {
  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const ids = materialsFromQuery(searchParams);
  const back = materialsStepPath(course.id, ids, addToCanvas);
  const kept = goalFromQuery(searchParams);
  const materials = await pickedMaterials(db(), actor, course.id, ids);

  if (!materials.ok) {
    return (
      <WizardShell step="goal" title={title} note={<p>I suggest the kind of activity once the materials are picked.</p>}>
        <p role="alert" className="text-danger">
          {materials.reason}
        </p>
        <Link href={back} className="self-start text-sm text-muted hover:text-text">
          ← Back to materials
        </Link>
      </WizardShell>
    );
  }

  const suggested = await suggestTypes(db(), graderModel(), { userId: actor.userId, courseId: course.id }, materials);
  const count = materials.readings.length + materials.guides.length;

  return (
    <WizardShell
      go={{ materials: { href: back } }}
      step="goal"
      title={title}
      note={
        suggested[0].reason ? (
          <p>
            I read your {count === 1 ? "material" : `${count} materials`}. {groupOf(suggested[0].mode).label} fits it best, so it&apos;s
            picked. Then write the learning goal, or press Draft and I&apos;ll write one for the kind you picked.
          </p>
        ) : (
          <p>Pick how students will work with the AI, then write the goal. Next, you&apos;ll set up the AI&apos;s role.</p>
        )
      }
    >
      <GoalTypeForm
        courseId={course.id}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        contentIds={ids.contentIds}
        guideIds={ids.guideIds}
        kept={kept.goal}
        suggested={suggested}
        back={back}
      />
    </WizardShell>
  );
}

/**
 * Step 2 on a saved activity (Lucy, feedback 21e8c594): its kind leads and
 * its goal is in the box. Changing them saves in place; the later steps keep
 * what's written, and their Draft and Tweak rewrite it for the new kind.
 */
export async function SavedGoalStep({ activity, addToCanvas, from, go, later, started }: SavedStepProps) {
  const settings = StudyChatSetupSettings.safeParse(activity.settings);
  const { readings, guides } = await activityMaterials(db(), activity.id);
  const back = keepFrom(keepPicker(setupPath(activity.courseId, activity.id, "materials"), addToCanvas), from);
  if (!settings.success) {
    return (
      <WizardShell step="goal" title={title} note={null} go={go}>
        <p className="text-danger">Some of this chat&apos;s settings don&apos;t fit any more. Create it again.</p>
      </WizardShell>
    );
  }
  const { mode, goal, typeReason } = settings.data;
  return (
    <WizardShell
      step="goal"
      title={title}
      note={
        <p>
          Change the kind of chat or its goal. What you&apos;ve written on the later steps stays; use Draft or Tweak there to
          rewrite it for a new kind.
        </p>
      }
      go={go}
      later={later}
    >
      {started}
      <GoalTypeForm
        courseId={activity.courseId}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        contentIds={readings.map((r) => r.id)}
        guideIds={guides.map((g) => g.id)}
        kept={goal}
        suggested={[{ mode, reason: typeReason ?? null, goal: null }]}
        back={back}
        activityId={activity.id}
        from={from}
      />
    </WizardShell>
  );
}
