import { randomUUID } from "node:crypto";
import Link from "next/link";
import { graderModel } from "@/ai/models";
import { db } from "@/db/client";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { MODE_SLUGS, MODES } from "../modes";
import { suggestTypes } from "../suggest";
import { pickedMaterials } from "./picks";
import { goalFromQuery, goalStepPath, materialsFromQuery, materialsStepPath } from "./query";
import { WizardShell } from "./shell";
import { type TypeCard, TypePickForm } from "./type-form";
import { reasonField } from "./type-request";

/**
 * Wizard step 3: the AI suggests three types from the picked materials and
 * the goal, best first, each with its reason; every other type is one click
 * away under "More types". Next drafts the activity (wizardTypeAction).
 */
export async function TypeStep({ actor, course, searchParams }: CreateScreenProps) {
  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const ids = materialsFromQuery(searchParams);
  const answers = goalFromQuery(searchParams);
  const title = "What kind of activity?";

  const materials = await pickedMaterials(db(), actor, course.id, ids);
  if (!materials.ok || !answers.goal) {
    return (
      <WizardShell step="type" title={title} note={<p>I suggest a type once the materials and the goal are set.</p>}>
        <p role="alert" className="text-danger">
          {materials.ok ? "Write the learning goal first." : materials.reason}
        </p>
        <Link
          href={materials.ok ? goalStepPath(course.id, ids, answers, addToCanvas) : materialsStepPath(course.id, ids, addToCanvas)}
          className="self-start text-sm text-muted hover:text-text"
        >
          ← Back
        </Link>
      </WizardShell>
    );
  }

  const suggestions = await suggestTypes(db(), graderModel(), { userId: actor.userId, courseId: course.id }, materials, answers.goal);
  const asCard = (slug: (typeof MODE_SLUGS)[number], reason: string | null): TypeCard => ({
    slug,
    label: MODES[slug].label,
    description: MODES[slug].description,
    reason,
  });
  const suggested = suggestions.map((s) => asCard(s.mode, s.reason));
  const others = MODE_SLUGS.filter((slug) => !suggestions.some((s) => s.mode === slug)).map((slug) => asCard(slug, null));
  const carried = [
    { name: "content", value: ids.contentIds.join(",") },
    ...(ids.guideIds.length > 0 ? [{ name: "guide", value: ids.guideIds.join(",") }] : []),
    { name: "goal", value: answers.goal },
    ...(answers.minutes ? [{ name: "minutes", value: answers.minutes }] : []),
  ];
  const reasonFields = suggestions.flatMap((s) => (s.reason ? [{ name: reasonField(s.mode), value: s.reason }] : []));
  const withReasons = suggestions.filter((s) => s.reason).length;

  return (
    <WizardShell
      step="type"
      title={title}
      note={
        withReasons > 0 ? (
          <p>
            From your goal and materials, I suggest {MODES[suggestions[0].mode].label}. Each card says why it fits. Pick one and
            I&apos;ll draft the whole chat.
          </p>
        ) : (
          <p>Explain fits any reading. Pick it, or open More types, and I&apos;ll draft the whole chat.</p>
        )
      }
      comingSoon={["Ask the wizard for changes"]}
    >
      <TypePickForm
        courseId={course.id}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        carried={carried}
        suggested={suggested}
        others={others}
        reasonFields={reasonFields}
        back={goalStepPath(course.id, ids, answers, addToCanvas)}
      />
    </WizardShell>
  );
}
