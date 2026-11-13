import type { ReactNode } from "react";

/**
 * A wizard step's extra options as a table: a label on the left, its control
 * on the right. `comingSoon` rows are listed, disabled, and say so; they never
 * pretend to work (ralph/PLAN.md).
 */
export function OptionTable({
  title,
  rows = [],
  comingSoon = [],
}: {
  title: string;
  rows?: { label: ReactNode; control: ReactNode }[];
  comingSoon?: readonly string[];
}) {
  return (
    <section className="max-w-3xl rounded-panel border border-border bg-surface">
      <h3 className="px-5 pt-4 pb-3 font-display text-lg font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <th scope="row" className="px-5 py-3 text-left font-medium">
                {r.label}
              </th>
              <td className="px-5 py-3 text-right">{r.control}</td>
            </tr>
          ))}
          {comingSoon.map((label) => (
            <tr key={label} className="border-t border-border text-muted">
              <th scope="row" className="px-5 py-3 text-left font-medium">
                {label}
              </th>
              <td className="px-5 py-3 text-right text-xs whitespace-nowrap">Coming soon</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
