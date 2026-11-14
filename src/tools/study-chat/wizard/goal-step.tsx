import { randomUUID } from "node:crypto";
import Link from "next/link";
import { graderModel } from "@/ai/models";
import { db } from "@/db/client";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { suggestTypes } from "../suggest";
import { GoalTypeForm } from "./goal-type-form";
import { pickedMaterials } from "./picks";
import { goalFromQuery, materialsFromQuery, materialsStepPath } from "./query";
import { WizardShell } from "./shell";
import { WIZARD_STEPS } from "./steps";
import { groupOf } from "./types";

const title = WIZARD_STEPS.find((s) => s.slug === "goal")!.question;

/**
 * Wizard step 2: how students will work with the AI, then the learning goal
 * written for that kind, then the length. The kinds and their goals are
 * suggested from the ticked materials in one call (feedback 084938dc: the
 * interaction first, then the outcome). Next drafts the whole chat
 * (wizardTypeAction) and opens step 3.
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
            picked, with a goal written for it. Pick another kind and I&apos;ll rewrite the goal for that one.
          </p>
        ) : (
          <p>Pick how students will work with the AI, then write the goal. I&apos;ll draft the whole chat around them.</p>
        )
      }
      comingSoon={["Ask the wizard for changes", "Start from a copy", "Activity group"]}
    >
      <GoalTypeForm
        courseId={course.id}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        contentIds={ids.contentIds}
        guideIds={ids.guideIds}
        kept={kept.goal}
        minutes={kept.minutes}
        suggested={suggested}
        back={back}
      />
    </WizardShell>
  );
}
