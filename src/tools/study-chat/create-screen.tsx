import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getTaughtGuide } from "@/content/guide";
import { getContent } from "@/content/store";
import { db } from "@/db/client";
import { keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import type { CreateScreenProps } from "@/tools/screens";
import { MaterialForm, ModeForm } from "./forms";
import { MODE_SLUGS, MODES } from "./modes";

/**
 * New Study Chat: the material (paste, upload, or a Canvas page or file), then
 * the kind of chat, then the AI drafts it and the review opens. Which step is
 * showing comes from the URL: ?content=<id> once the material is saved, and
 * &guide=<id> once the teacher adds the optional AI-only guide.
 */
export async function StudyChatCreate({ actor, course, searchParams }: CreateScreenProps) {
  const addToCanvas = pickerRequest(searchParams[PICKER_PARAM]);
  const here = keepPicker(`/courses/${course.id}/activities/new/study-chat`, addToCanvas);
  const content = typeof searchParams.content === "string" ? await getContent(db(), actor, course.id, searchParams.content) : null;
  const guide =
    content && typeof searchParams.guide === "string" ? await getTaughtGuide(db(), actor, course.id, searchParams.guide) : null;

  if (!content) {
    return (
      <section className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold">1. What will students study?</h3>
          <p className="text-muted">DALAA drafts the whole chat from it. Students read it before they start.</p>
        </div>
        <Link
          href={`/courses/${course.id}/content/canvas?next=${encodeURIComponent(here)}`}
          className="self-start text-sm font-medium text-accent-text underline"
        >
          Use a Canvas page or file
        </Link>
        <MaterialForm courseId={course.id} creationKey={randomUUID()} addToCanvas={addToCanvas} />
      </section>
    );
  }

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">2. Pick the kind of chat</h3>
        <p className="text-muted">
          Material: <span className="font-medium text-text">{content.name}</span>{" "}
          <Link href={here} className="text-sm underline hover:text-text">
            Change
          </Link>
        </p>
        {guide ? (
          <p className="text-muted">
            Guide only the AI reads: <span className="font-medium text-text">{guide.name}</span>{" "}
            <Link href={keepPicker(`${here.split("?")[0]}?content=${content.id}`, addToCanvas)} className="text-sm underline hover:text-text">
              Remove
            </Link>
          </p>
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-text">
              Add a guide only the AI reads (answer key, teaching note)
            </summary>
            <div className="mt-3 flex flex-col gap-3 rounded-panel border border-border bg-surface p-4">
              <p className="text-muted">
                The AI uses it to steer the chat and to grade. Students never see it.
              </p>
              <MaterialForm courseId={course.id} creationKey={randomUUID()} addToCanvas={addToCanvas} guideFor={content.id} />
            </div>
          </details>
        )}
      </div>
      <ModeForm
        courseId={course.id}
        contentId={content.id}
        guideId={guide?.id ?? null}
        creationKey={randomUUID()}
        addToCanvas={addToCanvas}
        modes={MODE_SLUGS.map((slug) => ({ slug, label: MODES[slug].label, description: MODES[slug].description }))}
      />
    </section>
  );
}
