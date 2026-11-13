/** The new Study Chat wizard's seven steps, in order (D-034). */
export const WIZARD_STEPS = [
  { slug: "materials", label: "Materials" },
  { slug: "goal", label: "Learning goal" },
  { slug: "type", label: "Activity type" },
  { slug: "scenario", label: "Scenario and persona" },
  { slug: "options", label: "Chat options" },
  { slug: "grading", label: "Grading" },
  { slug: "review", label: "Review and assign" },
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

/** Steps 4–7 work on the drafted activity; 1–3 come before it exists. */
export const SETUP_STEPS = ["scenario", "options", "grading", "review"] as const satisfies readonly WizardStep[];
export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: unknown): value is SetupStep {
  return (SETUP_STEPS as readonly unknown[]).includes(value);
}

export const setupPath = (courseId: string, activityId: string, step: SetupStep) =>
  `/courses/${courseId}/activities/${activityId}/setup/${step}`;

/** Where a setup step's form goes after saving: Next's step, a `goto:<step>` step, or null to stay. */
export function savedStepTarget(step: unknown, intent: unknown): SetupStep | null {
  if (!isSetupStep(step)) return null;
  if (intent === "next") return nextSetupStep(step) ?? step;
  const target = typeof intent === "string" && intent.startsWith("goto:") ? intent.slice("goto:".length) : null;
  return isSetupStep(target) ? target : null;
}

/** The step after `step`, or null after the last. */
export function nextSetupStep(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1] ?? null;
}

/** The step before `step`, or null on the first (step 3 came before the activity existed; there's no going back to it). */
export function previousSetupStep(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) - 1] ?? null;
}
