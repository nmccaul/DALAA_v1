import { Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TaughtActivity } from "@/activities/store";
import type { Actor } from "@/db/scope";
import { stepIndex, WIZARD_FORM_ID, WIZARD_STEPS, type WizardStep } from "./steps";

const LATER_STYLE = "shrink-0 text-sm whitespace-nowrap text-accent-text underline hover:text-text";

/** A step the list can take the teacher to: a plain link, or (`save`) a button that saves this step's form first. */
export type StepLink = { href: string; save?: boolean };

/** What steps 1–2 on a saved activity get from the setup page (feedback 21e8c594). */
export type SavedStepProps = {
  actor: Actor;
  activity: TaughtActivity;
  addToCanvas: string | null;
  searchParams: Record<string, string | string[] | undefined>;
  go: Partial<Record<WizardStep, StepLink>>;
  later: StepLink;
  /** "Students have started it" note, when they have. */
  started: ReactNode;
};

/**
 * The frame every wizard step sits in: the step list on the left (done steps
 * checked, the current one highlighted) and the step beside it, with a short
 * note under its title on what to do here. (A "DALAA wizard" panel on the right
 * held only that note and "Coming soon" tags, so it went (Nathan,
 * 2026-11-18): each box has its own Draft and Tweak, D-037.) Steps in `go`
 * can be clicked to go straight there (feedback a142d729, d6010bfd).
 * `later` puts "Save and finish later" at the top right, away from Next.
 */
export function WizardShell({
  step,
  title,
  note,
  go = {},
  later,
  children,
}: {
  step: WizardStep;
  title: string;
  /** What to do on this step, in a sentence or two; none when the step says it already. */
  note: ReactNode;
  go?: Partial<Record<WizardStep, StepLink>>;
  /** "Save and finish later", top right, away from Next (feedback deea6853). */
  later?: StepLink;
  children: ReactNode;
}) {
  const current = stepIndex(step);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Steps">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:flex-col">
          {WIZARD_STEPS.map((s, i) => {
            const done = i < current;
            const here = i === current;
            const link = here ? undefined : go[s.slug];
            const body = (
              <>
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    done ? "border-success bg-success text-white" : here ? "border-accent bg-accent text-white" : "border-border-strong"
                  }`}
                >
                  {done ? <Check size={14} weight="bold" aria-label="Done" /> : i + 1}
                </span>
                <span className={here ? "" : "hidden lg:inline"}>{s.label}</span>
              </>
            );
            const row = `flex items-center gap-2 rounded-control py-1.5 lg:px-2 ${here ? "bg-accent-soft font-bold text-accent-text" : done ? "text-text" : "text-muted"}`;
            const clickable = `${row} w-full text-left hover:bg-subtle hover:text-accent-text`;
            return (
              <li key={s.slug} aria-current={here ? "step" : undefined} className={link ? "" : row}>
                {!link ? (
                  body
                ) : link.save ? (
                  <button type="submit" form={WIZARD_FORM_ID} name="intent" value={`goto:${s.slug}`} title={`Save and go to ${s.label}`} aria-label={s.label} className={clickable}>
                    {body}
                  </button>
                ) : (
                  <Link href={link.href} aria-label={s.label} className={clickable}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">
              Step {current + 1} of {WIZARD_STEPS.length}
            </p>
            <h3 className="font-display text-xl font-semibold">{title}</h3>
            {note && <div className="max-w-prose text-sm text-muted">{note}</div>}
          </div>
          {later &&
            (later.save ? (
              <button type="submit" form={WIZARD_FORM_ID} name="intent" value="later" className={LATER_STYLE}>
                Save and finish later
              </button>
            ) : (
              <Link href={later.href} className={LATER_STYLE}>
                Save and finish later
              </Link>
            ))}
        </div>
        {children}
      </section>
    </div>
  );
}
