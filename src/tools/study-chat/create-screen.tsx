import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getTaughtGuide } from "@/content/guide";
import { getContent } from "@/content/store";
import { db } from "@/db/client";
import { keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { MaterialForm, ModeForm } from "./forms";
import { canvasGuideHref, GuidePanel } from "./guide-panel";
import { MODE_SLUGS, MODES } from "./modes";
import { PreviewNote } from "@/components/preview-note";
import { GoalStep } from "./wizard/goal-step";
import { MaterialsStep } from "./wizard/materials-step";
import { goalFromQuery, goalStepPath, materialsFromQuery, materialsStepPath } from "./wizard/query";
import { WizardShell } from "./wizard/shell";
import { isWizardStep, WIZARD_STEPS } from "./wizard/steps";

/**
 * New Study Chat: the material (paste, upload, or a Canvas page or file), then
 * the kind of chat, then the AI drafts it and the review opens. Which step is
 * showing comes from the URL: ?content=<id> once the material is saved, and
 * &guide=<id> once the teacher adds the optional AI-only guide (pasted,
 * uploaded, or from Canvas).
 */
export async function StudyChatCreate({ actor, course, searchParams }: CreateScreenProps) {
  // The new wizard (D-034), step by step as it's built; without ?step= the current flow stays.
  if (searchParams.step === "materials") return MaterialsStep({ actor, course, searchParams });
  if (searchParams.step === "goal") return GoalStep({ actor, course, searchParams });
  if (isWizardStep(searchParams.step)) return WizardNotYet({ courseId: course.id, step: searchParams.step, searchParams });

  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const here = keepPicker(`/courses/${course.id}/activities/new/study-chat`, addToCanvas);
  const content = typeof searchParams.content === "string" ? await getContent(db(), actor, course.id, searchParams.content) : null;
  const guide =
    content && typeof searchParams.guide === "string" ? await getTaughtGuide(db(), actor, course.id, searchParams.guide) : null;

  if (!content) {
    return (
      <section className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold">1. What will students study?</h3>
          <p className="text-muted">DALAA drafts the whole chat from it. Students read it before they start.</p>
        </div>
        <Link
          href={`/courses/${course.id}/content/canvas?next=${encodeURIComponent(here)}`}
          className="self-start text-sm font-medium text-accent-text underline"
        >
          Use a Canvas page or file
        </Link>
        <MaterialForm courseId={course.id} creationKey={randomUUID()} addToCanvas={addToCanvas} />
      </section>
    );
  }

  const withContent = keepPicker(`/courses/${course.id}/activities/new/study-chat?content=${content.id}`, addToCanvas);
  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">2. Pick the kind of chat</h3>
        <p className="text-muted">
          Material: <span className="font-medium text-text">{content.name}</span>{" "}
          <Link href={here} className="text-sm underline hover:text-text">
            Change
          </Link>
        </p>
        <GuidePanel
          guide={guide}
          remove={
            <Link href={withContent} className="text-sm underline hover:text-text">
              Remove
            </Link>
          }
          canvasHref={canvasGuideHref(course.id, withContent)}
          form={<MaterialForm courseId={course.id} creationKey={randomUUID()} addToCanvas={addToCanvas} guideFor={content.id} />}
        />
      </div>
      <ModeForm
        courseId={course.id}
        contentId={content.id}
        guideId={guide?.id ?? null}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        modes={MODE_SLUGS.map((slug) => ({ slug, label: MODES[slug].label, description: MODES[slug].description }))}
      />
    </section>
  );
}

/** A wizard step that isn't built yet: says so, and goes back to the goal (or the materials when there's no goal yet). */
function WizardNotYet({
  courseId,
  step,
  searchParams,
}: {
  courseId: string;
  step: (typeof WIZARD_STEPS)[number]["slug"];
  searchParams: CreateScreenProps["searchParams"];
}) {
  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const picked = materialsFromQuery(searchParams);
  const label = WIZARD_STEPS.find((s) => s.slug === step)!.label;
  const answers = goalFromQuery(searchParams);
  return (
    <WizardShell step={step} title={label} note={<p>This step is still being built.</p>}>
      <PreviewNote>
        {label} isn&apos;t built yet. You picked {picked.contentIds.length} reading{picked.contentIds.length === 1 ? "" : "s"}
        {picked.guideIds.length > 0 ? ` and ${picked.guideIds.length} AI-only note${picked.guideIds.length === 1 ? "" : "s"}` : ""}.
      </PreviewNote>
      {answers.goal ? (
        <Link href={goalStepPath(courseId, picked, answers, addToCanvas)} className="self-start text-sm text-muted hover:text-text">
          ← Back to the learning goal
        </Link>
      ) : (
        <Link href={materialsStepPath(courseId, picked, addToCanvas)} className="self-start text-sm text-muted hover:text-text">
          ← Back to materials
        </Link>
      )}
    </WizardShell>
  );
}
