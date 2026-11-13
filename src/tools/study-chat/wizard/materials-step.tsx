import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CANVAS_PROBLEM, loadMaterialRows } from "@/content/materials";
import { db } from "@/db/client";
import { afterPublishPath, keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { MaterialsPickForm, type PickRow } from "./materials-form";
import { pickValue } from "./picks";
import { materialsFromQuery } from "./query";
import { WizardShell } from "./shell";

/** Wizard step 1: tick the course's materials (saved, and the Canvas course's Pages and Files) the activity uses. */
export async function MaterialsStep({ actor, course, searchParams }: CreateScreenProps) {
  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const here = keepPicker(`/courses/${course.id}/activities/new/study-chat?step=materials`, addToCanvas);
  const { rows, canvas } = await loadMaterialRows(db(), actor, course.id);
  const ticked = materialsFromQuery(searchParams);
  const isTicked = new Set([...ticked.contentIds.map((id) => `content:${id}`), ...ticked.guideIds.map((id) => `guide:${id}`)]);
  const picks: PickRow[] = rows.flatMap((r) => {
    const value = pickValue(r);
    return value ? [{ value, name: r.name, source: r.source, seenBy: r.seenBy, checked: isTicked.has(value) }] : [];
  });

  return (
    <WizardShell
      step="materials"
      title="What will students work from?"
      note={
        <p>
          Tick the readings students study (<span className="font-bold">Students + AI</span>) and any notes only the AI should
          use, like a teaching note or answer key (<span className="font-bold">AI only</span>). I&apos;ll suggest a learning goal
          from them next.
        </p>
      }
      comingSoon={["Ask the wizard for changes"]}
    >
      {canvas === "not-connected" ? (
        <p className="text-sm text-muted">
          <Link href={`/canvas/connect?next=${encodeURIComponent(here)}`} className="text-accent-text hover:underline">
            Connect Canvas
          </Link>{" "}
          to pick from this course&apos;s Pages and Files.
        </p>
      ) : (
        canvas !== "connected" && <p className="text-sm text-muted">{CANVAS_PROBLEM[canvas]}</p>
      )}
      <MaterialsPickForm
        courseId={course.id}
        formKey={randomUUID()}
        addToCanvas={addToCanvas}
        rows={picks}
        back={afterPublishPath(course.id, addToCanvas)}
      />
    </WizardShell>
  );
}
