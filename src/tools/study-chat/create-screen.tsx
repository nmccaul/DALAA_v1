import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getContent } from "@/content/store";
import { db } from "@/db/client";
import type { CreateScreenProps } from "@/tools/screens";
import { MaterialForm, ModeForm } from "./forms";
import { MODE_SLUGS, MODES } from "./modes";

/**
 * New Study Chat: the material (paste, upload, or a Canvas page or file), then
 * the kind of chat, then the AI drafts it and the review opens. Which step is
 * showing comes from the URL: ?content=<id> once the material is saved.
 */
export async function StudyChatCreate({ actor, course, searchParams }: CreateScreenProps) {
  const here = `/courses/${course.id}/activities/new/study-chat`;
  const content = typeof searchParams.content === "string" ? await getContent(db(), actor, course.id, searchParams.content) : null;

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
        <MaterialForm courseId={course.id} creationKey={randomUUID()} />
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
      </div>
      <ModeForm
        courseId={course.id}
        contentId={content.id}
        creationKey={randomUUID()}
        modes={MODE_SLUGS.map((slug) => ({ slug, label: MODES[slug].label, description: MODES[slug].description }))}
      />
    </section>
  );
}
