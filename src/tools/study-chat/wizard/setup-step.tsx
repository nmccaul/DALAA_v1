import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewNote } from "@/components/preview-note";
import { keepPicker } from "@/lti/picker";
import type { SetupScreenProps } from "@/tools/screens";
import { StudyChatEditor } from "../editor";
import { StudyChatSettings } from "../schema";
import { SETUP_CARDS, setupNote } from "./setup-cards";
import { WizardShell } from "./shell";
import { isSetupStep, previousSetupStep, setupPath, WIZARD_STEPS } from "./steps";

/**
 * Wizard steps 4–7 on the drafted activity: each editing step shows its own
 * editor cards, open, with Next (save, then the next step) and Save as draft.
 * The panel's note comes from the stored settings.
 */
export function StudyChatSetup({ activity, step, addToCanvas }: SetupScreenProps) {
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
    return (
      <WizardShell step={step} title={title} note={<p>{setupNote(step, parsed.data)}</p>}>
        <PreviewNote>This step isn&apos;t built yet. Open the activity to try it and publish it.</PreviewNote>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={keepPicker(`/courses/${activity.courseId}/activities/${activity.id}`, addToCanvas)}
            className="text-sm font-medium text-accent-text underline"
          >
            Open the activity
          </Link>
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
