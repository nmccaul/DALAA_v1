import { Check } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { stepIndex, WIZARD_STEPS, type WizardStep } from "./steps";

/**
 * The frame every wizard step sits in: the step list on the left (done steps
 * checked, the current one highlighted), the step itself in the middle, and
 * the "DALAA wizard" panel on the right with a note about this step and what's
 * coming soon. The panel has no input box yet (ralph/PLAN.md).
 */
export function WizardShell({
  step,
  title,
  note,
  comingSoon = [],
  children,
}: {
  step: WizardStep;
  title: string;
  note: ReactNode;
  comingSoon?: string[];
  children: ReactNode;
}) {
  const current = stepIndex(step);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]">
      <nav aria-label="Steps">
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:flex-col">
          {WIZARD_STEPS.map((s, i) => {
            const done = i < current;
            const here = i === current;
            return (
              <li
                key={s.slug}
                aria-current={here ? "step" : undefined}
                className={`flex items-center gap-2 rounded-control py-1.5 lg:px-2 ${here ? "bg-accent-soft font-bold text-accent-text" : done ? "text-text" : "text-muted"}`}
              >
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    done ? "border-success bg-success text-white" : here ? "border-accent bg-accent text-white" : "border-border-strong"
                  }`}
                >
                  {done ? <Check size={14} weight="bold" aria-label="Done" /> : i + 1}
                </span>
                <span className={here ? "" : "hidden lg:inline"}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">
            Step {current + 1} of {WIZARD_STEPS.length}
          </p>
          <h3 className="font-display text-xl font-semibold">{title}</h3>
        </div>
        {children}
      </section>

      <aside aria-label="DALAA wizard" className="flex flex-col gap-3 self-start rounded-panel border border-border bg-surface p-4">
        <h4 className="font-bold">DALAA wizard</h4>
        <div className="text-sm text-text">{note}</div>
        {comingSoon.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {comingSoon.map((label) => (
              <li key={label} className="rounded-control border border-border px-2.5 py-0.5 text-xs text-muted">
                {label} · Coming soon
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
