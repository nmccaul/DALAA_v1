import { countStartedAttempts } from "@/attempts/store";
import { db } from "@/db/client";
import type { ReviewScreenProps } from "@/tools/screens";
import { StudyChatEditor } from "./editor";
import { MODES } from "./modes";
import { StudyChatSettings } from "./schema";

/** Why a saved change won't reach some students (D-031); NULL when nobody has started. Exported for tests. */
export function startedNote(started: number): string | null {
  if (started === 0) return null;
  return `${started === 1 ? "1 student has" : `${started} students have`} started; changes apply to new attempts only.`;
}

/** The drafted Study Chat as short summary cards the teacher opens to edit, then Publish. */
export async function StudyChatReview({ activity, addToCanvas }: ReviewScreenProps) {
  const parsed = StudyChatSettings.safeParse(activity.settings);
  if (!parsed.success) {
    return <p className="text-danger">Some of this chat&apos;s settings don&apos;t fit any more. Create it again.</p>;
  }
  const published = activity.status === "published";
  const note = startedNote(await countStartedAttempts(db(), activity.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight break-words">{activity.title}</h2>
        <p className="text-muted">
          {MODES[parsed.data.mode].label} · {published ? "Published" : "Draft, students can't see it yet"}
        </p>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      <StudyChatEditor
        courseId={activity.courseId}
        activityId={activity.id}
        published={published}
        initial={parsed.data}
        addToCanvas={addToCanvas}
      />
    </div>
  );
}
