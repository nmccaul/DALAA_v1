import { randomUUID } from "node:crypto";
import Link from "next/link";
import { graderModel } from "@/ai/models";
import { db } from "@/db/client";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { suggestGoalAndType } from "../suggest";
import { GoalTypeForm } from "./goal-type-form";
import { pickedMaterials } from "./picks";
import { goalFromQuery, materialsFromQuery, materialsStepPath } from "./query";
import { WizardShell } from "./shell";
import { WIZARD_STEPS } from "./steps";
import { groupOf } from "./types";

const title = WIZARD_STEPS.find((s) => s.slug === "goal")!.question;

/**
 * Wizard step 2: the learning goal and the kind of activity, suggested
 * together from the ticked materials in one call (Nathan, 2026-11-13: one
 * decision, "suggested based on reading"). Next drafts the whole chat
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
      <WizardShell step="goal" title={title} note={<p>I suggest a goal once the materials are picked.</p>}>
        <p role="alert" className="text-danger">
          {materials.reason}
        </p>
        <Link href={back} className="self-start text-sm text-muted hover:text-text">
          ← Back to materials
        </Link>
      </WizardShell>
    );
  }

  const suggestion = await suggestGoalAndType(db(), graderModel(), { userId: actor.userId, courseId: course.id }, materials);
  const goal = kept.goal ?? suggestion.goal ?? "";
  const count = materials.readings.length + materials.guides.length;
  const carried = [
    { name: "content", value: ids.contentIds.join(",") },
    ...(ids.guideIds.length > 0 ? [{ name: "guide", value: ids.guideIds.join(",") }] : []),
  ];

  return (
    <WizardShell
      go={{ materials: { href: back } }}
      step="goal"
      title={title}
      note={
        suggestion.goal ? (
          <p>
            I read your {count === 1 ? "material" : `${count} materials`} and suggested a goal and the kind of activity that fits it:{" "}
            {groupOf(suggestion.types[0].mode).label}. Change either, then I&apos;ll draft the whole chat.
          </p>
        ) : (
          <p>Write the goal in a sentence or two and pick the kind of activity. I&apos;ll draft the whole chat around them.</p>
        )
      }
      comingSoon={["Ask the wizard for changes", "Start from a copy", "Activity group"]}
    >
      <GoalTypeForm
        courseId={course.id}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        carried={carried}
        goal={goal}
        goalSuggested={!kept.goal && suggestion.goal !== null}
        minutes={kept.minutes}
        suggested={suggestion.types}
        back={back}
      />
    </WizardShell>
  );
}
