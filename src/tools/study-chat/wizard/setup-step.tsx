import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";
import { assignToCanvasOn } from "@/activities/assign";
import { activityMaterials } from "@/activities/materials";
import { rememberSetupStep } from "@/activities/store";
import { countStartedAttempts } from "@/attempts/store";
import { FROM_PARAM, keepFrom } from "@/courses/origin";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db/client";
import { keepPicker } from "@/lti/picker";
import type { SetupScreenProps } from "@/tools/screens";
import { StudyChatEditor } from "../editor";
import { PublishForm } from "../forms";
import { startedNote } from "../review-screen";
import { unfinished } from "../create";
import { StudyChatSettings, StudyChatSetupSettings } from "../schema";
import { TrialPanel } from "../trial-panel";
import { reviewSummary, setupCards, setupNote } from "./setup-cards";
import { WizardShell } from "./shell";
import {
  finishLaterPath,
  isSetupStep,
  previousSetupStep,
  RESUME_STEP,
  resumeStep,
  SETUP_STEPS,
  setupPath,
  WIZARD_STEPS,
  type WizardStep,
} from "./steps";
import { SavedGoalStep } from "./goal-step";
import { SavedMaterialsStep } from "./materials-step";

/**
 * Wizard steps 4–7 on the drafted activity: each editing step shows its own
 * editor cards, open, with Next (save, then the next step) and, top right,
 * Save and finish later (save, then the course's activities).
 * Step 7 sums it up, lets the teacher try it as a student, then assigns it
 * (ASSIGN_TO_CANVAS) or publishes it. The panel's note comes from the stored settings.
 */
export async function StudyChatSetup({ actor, activity, step, addToCanvas, searchParams }: SetupScreenProps) {
  // Opened from another course's list (checked by the page): its links keep that course and lead back to it (feedback 12b101b4).
  const from = typeof searchParams[FROM_PARAM] === "string" ? searchParams[FROM_PARAM] : null;
  if (step === RESUME_STEP) redirect(keepFrom(keepPicker(setupPath(activity.courseId, activity.id, resumeStep(activity.setupStep)), addToCanvas), from));
  const path = (s: WizardStep) => keepFrom(keepPicker(setupPath(activity.courseId, activity.id, s), addToCanvas), from);
  const later = keepPicker(finishLaterPath(activity.courseId, activity, from), addToCanvas);
  // Every step works on the saved draft, so any can be opened from the list; from a step with a form, saving first.
  const go = (save: boolean) =>
    Object.fromEntries(WIZARD_STEPS.map((s) => [s.slug, { href: path(s.slug), save }])) as Record<WizardStep, { href: string; save: boolean }>;
  // Steps 1–2 open again on a saved activity, to change its materials or kind (feedback 21e8c594).
  if (step === "materials" || step === "goal") {
    const started = startedBanner(startedNote(await countStartedAttempts(db(), activity.id)));
    const props = { actor, activity, addToCanvas, from, searchParams, go: go(true), later: { href: later, save: true }, started };
    return step === "materials" ? SavedMaterialsStep(props) : SavedGoalStep(props);
  }
  if (!isSetupStep(step)) notFound();
  if (activity.status === "draft") await rememberSetupStep(db(), activity, step);
  const title = WIZARD_STEPS.find((s) => s.slug === step)!.question;
  // A draft may be part-written (the teacher writes, or asks DALAA); a published chat is complete.
  const parsed = (activity.status === "published" ? StudyChatSettings : StudyChatSetupSettings).safeParse(activity.settings);
  if (!parsed.success) {
    return (
      <WizardShell step={step} title={title} note={null}>
        <p className="text-danger">Some of this chat&apos;s settings don&apos;t fit any more. Create it again.</p>
      </WizardShell>
    );
  }
  const previous = previousSetupStep(step);

  if (step === "review") {
    const { readings, guides } = await activityMaterials(db(), activity.id);
    const published = activity.status === "published";
    // From Canvas's "Add to Canvas" picker, Publish goes back to the picker; Canvas makes the assignment there.
    const assign = assignToCanvasOn() && !addToCanvas;
    const missing = unfinished(activity.settings);
    if (missing.length > 0) {
      return (
        <WizardShell step={step} title={title} note={<p>A few things are still empty. Fill them in, then try it and assign it.</p>} go={go(false)} later={{ href: later }}>
          <section role="status" className="flex flex-col gap-2 rounded-panel border border-border-strong bg-warn-soft px-4 py-3 text-warn-text">
            <h4 className="font-semibold">Before students can take it</h4>
            <ul className="list-disc pl-5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            {previous && (
              <Link href={path(previous)} className="text-sm text-muted hover:text-text">
                ← Back
              </Link>
            )}
            <ButtonLink href={path(SETUP_STEPS[0])}>Finish setting it up</ButtonLink>
          </div>
        </WizardShell>
      );
    }
    return (
      <WizardShell step={step} title={title} note={<p>{setupNote(step, parsed.data)}</p>} go={go(false)} later={published ? undefined : { href: later }}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-panel border border-border bg-surface px-4 py-3">
          {reviewSummary(parsed.data, activity.title, readings.length + guides.length, activity.points).map((row) => (
            <Fragment key={row.label}>
              <dt className="text-muted">{row.label}</dt>
              <dd className="break-words font-medium">{row.value}</dd>
            </Fragment>
          ))}
        </dl>
        <TrialPanel
          activityId={activity.id}
          persona={parsed.data.persona.name}
          title={activity.title}
          assigned={activity.assigned}
          canvasCourseUrl={activity.canvasCourseUrl}
        />
        <section aria-labelledby="assign-heading" className="flex flex-col gap-2">
          <h4 id="assign-heading" className="font-display text-lg font-semibold">
            {assign ? "Assign" : "Publish"}
          </h4>
          {assign ? (
            <>
              <p className="text-muted">DALAA publishes it and adds it to Canvas Assignments, where students open it and where its grade goes.</p>
              <div>
                <ButtonLink href={`/courses/${activity.courseId}/activities/${activity.id}/assign`}>Assign</ButtonLink>
              </div>
            </>
          ) : published ? (
            <p className="text-muted">It&apos;s published. In Canvas, add an assignment that opens DALAA and pick this activity.</p>
          ) : (
            <>
              <p className="text-muted">Then, in Canvas, add an assignment that opens DALAA and pick this activity.</p>
              <PublishForm courseId={activity.courseId} activityId={activity.id} addToCanvas={addToCanvas} />
            </>
          )}
        </section>
        <div className="flex flex-wrap items-center gap-3">
          {previous && (
            <Link href={path(previous)} className="text-sm text-muted hover:text-text">
              ← Back
            </Link>
          )}
        </div>
      </WizardShell>
    );
  }

  // Edit can open an activity students have started: say changes reach new attempts only (D-031).
  const started = startedBanner(startedNote(await countStartedAttempts(db(), activity.id)));
  return (
    <WizardShell step={step} title={title} note={<p>{setupNote(step, parsed.data)}</p>} go={go(true)} later={{ href: later, save: true }}>
      {started}
      <StudyChatEditor
        // A new step is a new form: its cards open and its unsaved state starts fresh.
        key={step}
        courseId={activity.courseId}
        activityId={activity.id}
        published={activity.status === "published"}
        initial={parsed.data}
        addToCanvas={addToCanvas}
        from={from}
        cards={setupCards(step, parsed.data)}
        wizard={{ step, previous }}
      />
    </WizardShell>
  );
}

/** "Students have started it: changes reach new attempts only" (D-031), when they have. */
function startedBanner(started: string | null) {
  return (
    started && (
      <p role="status" className="mb-4 rounded-control border border-border-strong bg-warn-soft px-4 py-3 text-warn-text">
        {started}
      </p>
    )
  );
}
