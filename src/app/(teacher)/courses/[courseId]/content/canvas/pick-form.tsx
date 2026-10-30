"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { pickFromCanvasAction, type PickState } from "./actions";

/** One page or file in the list, with its own "Use this" and its own error. */
export function PickForm({
  courseId,
  creationKey,
  pick,
  next,
  here,
  guide,
  children,
}: {
  courseId: string;
  creationKey: string;
  pick: string;
  next: string;
  /** This picker's own address, to come back to after reconnecting. */
  here: string;
  /** Saving it as an AI-only guide, attached to `activityId` when there is one. */
  guide: { activityId: string } | null;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<PickState, FormData>(pickFromCanvasAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      <input type="hidden" name="pick" value={pick} />
      <input type="hidden" name="next" value={next} />
      {guide && <input type="hidden" name="for" value="guide" />}
      {guide?.activityId && <input type="hidden" name="activity" value={guide.activityId} />}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">{children}</div>
        <Button variant="secondary" disabled={pending} className="shrink-0">
          {pending ? "Reading…" : "Use this"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}{" "}
          {state.reconnect && (
            <a href={`/canvas/connect?next=${encodeURIComponent(here)}`} target="_blank" rel="noreferrer" className="underline">
              Reconnect Canvas ↗
            </a>
          )}
        </p>
      )}
    </form>
  );
}
