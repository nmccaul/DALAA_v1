import { randomUUID } from "node:crypto";
import { countStartedAttempts } from "@/attempts/store";
import { activityMaterials } from "@/activities/materials";
import { SeenByPill } from "@/components/seen-by-pill";
import { db } from "@/db/client";
import type { ReviewScreenProps } from "@/tools/screens";
import { keepPicker } from "@/lti/picker";
import { StudyChatEditor } from "./editor";
import { MaterialForm, RemoveGuideForm } from "./forms";
import { canvasGuideHref, GuidePanel } from "./guide-panel";
import { MODES } from "./modes";
import { StudyChatSettings } from "./schema";
import { TrialPanel } from "./trial-panel";

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
  const { readings, guides } = await activityMaterials(db(), activity.id);
  const here = keepPicker(`/courses/${activity.courseId}/activities/${activity.id}`, addToCanvas);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[1.75rem] font-normal break-words">{activity.title}</h2>
        <p className="flex flex-wrap items-center gap-2 text-muted">
          <span>{MODES[parsed.data.mode].label}</span>
          {published ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-text">Published</span>
          ) : (
            <span className="rounded-full border border-dashed border-muted px-2.5 py-0.5 text-xs font-bold">Draft</span>
          )}
          {!published && <span className="text-sm">Students can&apos;t see it yet</span>}
        </p>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      <section aria-labelledby="materials-heading" className="flex flex-col gap-2">
        <h3 id="materials-heading" className="font-display text-lg font-semibold">
          Materials
        </h3>
        <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
          {readings.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 break-words font-medium">{r.name}</span>
              <SeenByPill seenBy="students" />
            </li>
          ))}
          {guides.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 break-words font-medium">{g.name}</span>
              <SeenByPill seenBy="ai" />
              <RemoveGuideForm courseId={activity.courseId} activityId={activity.id} guideId={g.id} addToCanvas={addToCanvas} />
            </li>
          ))}
        </ul>
      </section>
      <GuidePanel
        guide={null}
        remove={null}
        canvasHref={canvasGuideHref(activity.courseId, here, activity.id)}
        form={<MaterialForm courseId={activity.courseId} creationKey={randomUUID()} addToCanvas={addToCanvas} guideOf={activity.id} />}
      />
      <StudyChatEditor
        courseId={activity.courseId}
        activityId={activity.id}
        published={published}
        initial={parsed.data}
        addToCanvas={addToCanvas}
      />
      <TrialPanel activityId={activity.id} persona={parsed.data.persona.name} />
    </div>
  );
}
