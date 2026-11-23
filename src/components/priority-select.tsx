"use client";

import { PRIORITIES, type Priority } from "@/feedback/report";
import { PRIORITY_TONE } from "./priority-tone";


/**
 * An admin's menu for a report's priority (D-042): changing it saves at once
 * through `action`, which gets the report's `id` and the new `priority`
 * ("" for none).
 */
export function PrioritySelect({ id, priority, action }: { id: string; priority: Priority | null; action: (form: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`priority-${id}`}>
        Priority
      </label>
      {/* Keyed by the saved value: React resets a form after its action, and the menu must show what was saved. */}
      <select
        key={priority ?? "none"}
        id={`priority-${id}`}
        name="priority"
        defaultValue={priority ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded-full border px-2 py-0.5 text-[13px] font-bold ${PRIORITY_TONE[priority ?? "none"]}`}
      >
        <option value="">Not set</option>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </form>
  );
}
