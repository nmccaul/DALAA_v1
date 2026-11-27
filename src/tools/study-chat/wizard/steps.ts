import { keepFrom, originListPath } from "@/courses/origin";
import { keepPicker } from "@/lti/picker";
import { activityListPath } from "@/tools/catalog";

/**
 * The Study Chat wizard's six steps, in order (D-034; reworked 2026-11-13 by
 * Nathan: each step answers one question the teacher has). `label` is the
 * step list's; `question` is the step's title.
 */
export const WIZARD_STEPS = [
  { slug: "materials", label: "Materials", question: "What should students read, and what should the AI know?" },
  { slug: "goal", label: "Activity and goal", question: "How will students work through this reading?" },
  { slug: "scenario", label: "The AI's role", question: "Who should the AI be?" },
  { slug: "grading", label: "Grading", question: "How will you know they got it?" },
  { slug: "options", label: "Chat options", question: "How should the chat run?" },
  { slug: "review", label: "Review and assign", question: "Review and assign" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["slug"];

export function isWizardStep(value: unknown): value is WizardStep {
  return WIZARD_STEPS.some((s) => s.slug === value);
}

/** 0-based position of a step. */
export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((s) => s.slug === step);
}

/**
 * The id of a setup step's editor form. The step list's buttons submit it
 * with intent `goto:<step>`, so jumping to another step saves first, like Next.
 */
export const WIZARD_FORM_ID = "wizard-step-form";

/**
 * Steps 3–6: the editor's steps on the drafted activity. Steps 1–2 come
 * before it exists, and open on it again too, to change its materials or
 * kind (Lucy, feedback 21e8c594), but with their own forms.
 */
export const SETUP_STEPS = ["scenario", "grading", "options", "review"] as const satisfies readonly WizardStep[];
export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: unknown): value is SetupStep {
  return (SETUP_STEPS as readonly unknown[]).includes(value);
}

/**
 * The URL step that opens a draft where the teacher left off: the setup step
 * they were last on, else the first (feedback 391261a8).
 */
export const RESUME_STEP = "resume";

/** Where `resume` goes: the step last stored, when it's still a setup step. */
export const resumeStep = (stored: string | null): SetupStep => (isSetupStep(stored) ? stored : SETUP_STEPS[0]);

export const setupPath = (courseId: string, activityId: string, step: WizardStep) =>
  `/courses/${courseId}/activities/${activityId}/setup/${step}`;

/**
 * "Save and finish later" (PRD: one meaning everywhere): save, then the
 * Activities list the activity is in (Not assigned for a draft), where the
 * teacher picks it up again.
 */
export const finishLaterPath = (courseId: string, activity: { assigned: boolean }, from: string | null = null) =>
  from ? originListPath(from) : activityListPath(courseId, activity);

/**
 * Where a saved activity's step goes after its form saves: "Save and finish
 * later", Next's step or a step in the list, or null to stay. `from` is the
 * checked course the teacher opened it from (feedback 12b101b4), kept on every
 * step and led back to by "Save and finish later".
 */
export function savedStepRedirect(
  activity: { courseId: string; id: string; assigned: boolean },
  step: unknown,
  intent: unknown,
  picker: string | null,
  from: string | null,
): string | null {
  if (intent === "later") return keepPicker(finishLaterPath(activity.courseId, activity, from), picker);
  const target = savedStepTarget(step, intent);
  return target ? keepFrom(keepPicker(setupPath(activity.courseId, activity.id, target), picker), from) : null;
}

/** Where a saved activity's step goes after saving: Next's step, a `goto:<step>` step, or null to stay. */
export function savedStepTarget(step: unknown, intent: unknown): WizardStep | null {
  if (!isWizardStep(step)) return null;
  if (intent === "next") return nextSetupStep(step) ?? step;
  const target = typeof intent === "string" && intent.startsWith("goto:") ? intent.slice("goto:".length) : null;
  return isWizardStep(target) ? target : null;
}

/** The step after `step`, or null after the last. */
export function nextSetupStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) + 1]?.slug ?? null;
}

/** The step before `step`, or null on the first. On a saved activity, step 3 goes back to step 2 (feedback 21e8c594). */
export function previousSetupStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) - 1]?.slug ?? null;
}
