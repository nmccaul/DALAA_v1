import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { assignToCanvasOn } from "@/activities/assign";
import { activityMaterials } from "@/activities/materials";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db/client";
import { keepPicker } from "@/lti/picker";
import type { SetupScreenProps } from "@/tools/screens";
import { StudyChatEditor } from "../editor";
import { PublishForm } from "../forms";
import { StudyChatSettings } from "../schema";
import { TrialPanel } from "../trial-panel";
import { reviewSummary, SETUP_CARDS, setupNote } from "./setup-cards";
import { WizardShell } from "./shell";
import { isSetupStep, previousSetupStep, setupPath, WIZARD_STEPS } from "./steps";

/**
 * Wizard steps 4–7 on the drafted activity: each editing step shows its own
 * editor cards, open, with Next (save, then the next step) and Save as draft.
 * Step 7 sums it up, lets the teacher try it as a student, then assigns it
 * (ASSIGN_TO_CANVAS) or publishes it. The panel's note comes from the stored settings.
 */
export async function StudyChatSetup({ activity, step, addToCanvas }: SetupScreenProps) {
  if (!isSetupStep(step)) notFound();
  const title = WIZARD_STEPS.find((s) => s.slug === step)!.label;
  const parsed = StudyChatSettings.safeParse(activity.settings);
  if (!parsed.success) {
    return (
      <WizardShell step={step} title={title} note={null}>
        <p className="text-danger">Some of this chat&apos;s settings don&apos;t fit any more. Create it again.</p>
      </WizardShell>
    );
  }
  const path = (s: Parameters<typeof setupPath>[2]) => keepPicker(setupPath(activity.courseId, activity.id, s), addToCanvas);
  const previous = previousSetupStep(step);

  if (step === "review") {
    const { readings, guides } = await activityMaterials(db(), activity.id);
    const published = activity.status === "published";
    // From Canvas's "Add to Canvas" picker, Publish goes back to the picker; Canvas makes the assignment there.
    const assign = assignToCanvasOn() && !addToCanvas;
    return (
      <WizardShell step={step} title={title} note={<p>{setupNote(step, parsed.data)}</p>}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-panel border border-border bg-surface px-4 py-3">
          {reviewSummary(parsed.data, activity.title, readings.length + guides.length, activity.points).map((row) => (
            <Fragment key={row.label}>
              <dt className="text-muted">{row.label}</dt>
              <dd className="break-words font-medium">{row.value}</dd>
            </Fragment>
          ))}
        </dl>
        <TrialPanel activityId={activity.id} persona={parsed.data.persona.name} />
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
          {!published && (
            <Link href={keepPicker(`/courses/${activity.courseId}?show=unassigned`, addToCanvas)} className="text-sm text-accent-text underline">
              Save as draft
            </Link>
          )}
          {previous && (
            <Link href={path(previous)} className="text-sm text-muted hover:text-text">
              ← Back
            </Link>
          )}
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell step={step} title={title} note={<p>{setupNote(step, parsed.data)}</p>} comingSoon={["Ask the wizard for changes"]}>
      <StudyChatEditor
        // A new step is a new form: its cards open and its unsaved state starts fresh.
        key={step}
        courseId={activity.courseId}
        activityId={activity.id}
        published={activity.status === "published"}
        initial={parsed.data}
        addToCanvas={addToCanvas}
        cards={SETUP_CARDS[step]}
        wizard={{ step, back: previous && path(previous) }}
      />
    </WizardShell>
  );
}
