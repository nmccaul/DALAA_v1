"use client";

import { KINDS, PRIORITIES } from "@/feedback/report";

const select = "rounded-control border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text";

/**
 * The dropdowns under the tab pills (D-042): a section of the picked tab,
 * then type and priority. A plain GET form, so each change just reloads the
 * page with the new filters; without script, Apply does the same.
 */
export function FeedbackFilters({
  action,
  mine,
  tab,
  sections,
  values,
}: {
  action: string;
  mine: boolean;
  tab: string | null;
  sections: { value: string; label: string }[];
  values: { section: string; type: string; priority: string };
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <form
      method="get"
      action={action}
      // Leave unset filters out of the address.
      onSubmit={(e) => e.currentTarget.querySelectorAll("select").forEach((s) => (s.disabled = s.value === ""))}
      className="flex flex-wrap items-end gap-3"
    >
      {mine && <input type="hidden" name="feedback" value="mine" />}
      {tab && <input type="hidden" name="tab" value={tab} />}
      {sections.length > 1 && (
        <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
          Section
          <select name="section" defaultValue={values.section} onChange={submit} className={select}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
        Type
        <select name="type" defaultValue={values.type} onChange={submit} className={select}>
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
        Priority
        <select name="priority" defaultValue={values.priority} onChange={submit} className={select}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="none">Not set</option>
        </select>
      </label>
      <noscript>
        <button type="submit" className="rounded-control border border-border-strong px-3 py-1.5 text-sm">
          Apply
        </button>
      </noscript>
    </form>
  );
}
