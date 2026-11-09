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
