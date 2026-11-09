"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { localInputValue } from "@/components/time";
import { Button, inputStyles } from "@/components/ui";
import { assignAction, type AssignState } from "./actions";

const noChange = () => () => {};

/**
 * A date and time in the teacher's own zone, sent as an ISO string so the
 * server never guesses the zone. The visible field fills in after hydration
 * (the server can't know the zone).
 */
function DateTimeField({ name, label, hint, initial }: { name: string; label: string; hint: string; initial: string | null }) {
  const inBrowser = useSyncExternalStore(noChange, () => true, () => false);
  const [iso, setIso] = useState(initial ?? "");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="font-medium">
        {label}
      </label>
      <input
        key={String(inBrowser)}
        id={name}
        type="datetime-local"
        defaultValue={inBrowser && initial ? localInputValue(new Date(initial)) : ""}
        onChange={(e) => setIso(e.target.value ? new Date(e.target.value).toISOString() : "")}
        aria-describedby={`${name}-hint`}
        className={`${inputStyles} max-w-xs`}
      />
      <input type="hidden" name={name} value={iso} />
      <p id={`${name}-hint`} className="text-sm text-muted">
        {hint}
      </p>
    </div>
  );
}

/**
 * The Assign form, or with `dueOnly` the due-date edit of something already
 * assigned. `groups` null: Canvas puts it in the course's first group.
 */
export function AssignForm({
  courseId,
  activityId,
  dueAt,
  groups,
  dueOnly,
  connectHref,
}: {
  courseId: string;
  activityId: string;
  dueAt: string | null;
  groups: { id: number; name: string }[] | null;
  dueOnly: boolean;
  connectHref: string;
}) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignAction, {});
  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      <DateTimeField name="dueAt" label="Due" hint="Leave it blank for no due date." initial={dueAt} />
      {!dueOnly && (
        <>
          <DateTimeField
            name="lockAt"
            label="Closes"
            hint="After this, students can't open it. Leave it blank to keep it open."
            initial={null}
          />
          {groups && groups.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="groupId" className="font-medium">
                Assignment group in Canvas
              </label>
              <select id="groupId" name="groupId" defaultValue={groups[0].id} className={`${inputStyles} max-w-xs`}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input type="hidden" name="publishChoice" value="1" />
          <label className="flex items-start gap-2">
            <input type="checkbox" name="publish" defaultChecked className="mt-1.5" />
            <span>
              Students can see it in Canvas now
              <span className="block text-sm text-muted">Leave this off to publish it later from Canvas.</span>
            </span>
          </label>
        </>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}{" "}
          {state.connect && (
            <Link href={connectHref} className="text-accent-text underline">
              Connect Canvas
            </Link>
          )}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding it to Canvas…" : dueOnly ? "Save due date" : "Assign"}
        </Button>
      </div>
    </form>
  );
}
