import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { clientFor, connectReturnPath } from "@/canvas/connection";
import { listCourseCanvasContent, type CourseContentProblem } from "@/canvas/content";
import { VaultError } from "@/canvas/vault";
import { EmptyState, buttonStyles } from "@/components/ui";
import { getContent } from "@/content/store";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { PickForm } from "./pick-form";

export const metadata: Metadata = { title: "Use a Canvas page or file" };

const PROBLEMS: Record<CourseContentProblem, { title: string; body: string }> = {
  "not-yours": { title: "Canvas won't show this course's pages", body: "Canvas doesn't list you as a teacher of the course this one is connected to." },
  "not-linked": { title: "This course isn't connected to Canvas", body: "Connect it to its Canvas course first, then pick a page or file from it." },
  "wrong-canvas": {
    title: "This course is in the other Canvas",
    body: "It came from practice Canvas and you're connected to real Canvas, or the other way round. Switch in Settings, then come back.",
  },
  reconnect: { title: "Canvas didn't accept your connection", body: "Reconnect Canvas, then come back to this page." },
  unavailable: { title: "We couldn't reach Canvas", body: "Try again in a minute." },
};

/**
 * Course content from Canvas (T16c): pick one page or file and it's saved to
 * the course. Whoever sent the teacher here (?next=) gets it back as ?content=.
 * With ?for=guide it's saved as a guide only the AI reads and comes back as
 * ?guide=; with &activity= too, it's attached to that activity.
 */
export default async function CanvasContentPage({ params, searchParams }: PageProps<"/courses/[courseId]/content/canvas">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const next = typeof q.next === "string" && q.next ? connectReturnPath(q.next) : "";
  const guide = q.for === "guide" ? { activityId: typeof q.activity === "string" ? q.activity : "" } : null;
  const hereQuery = new URLSearchParams();
  if (next) hereQuery.set("next", next);
  if (guide) hereQuery.set("for", "guide");
  if (guide?.activityId) hereQuery.set("activity", guide.activityId);
  const here = `/courses/${course.id}/content/canvas${hereQuery.size ? `?${hereQuery}` : ""}`;
  const saved = typeof q.content === "string" ? await getContent(db(), actor, course.id, q.content) : null;
  const back = next || `/courses/${course.id}`;

  const canvas = await clientFor(db(), actor).catch((e) => {
    if (e instanceof VaultError) return null;
    throw e;
  });
  const listed = canvas ? await listCourseCanvasContent(db(), actor, canvas, course.id) : null;
  const connectHref = `/canvas/connect?next=${encodeURIComponent(here)}`;

  let body: React.ReactNode;
  if (!listed) {
    body = (
      <EmptyState
        title="Connect Canvas to use its pages"
        action={
          // A new tab: Canvas's approve page won't open inside the Canvas frame. Plain <a> so nothing prefetches.
          <a href={connectHref} target="_blank" rel="noreferrer" className={buttonStyles.primary}>
            Connect Canvas ↗
          </a>
        }
      >
        <p>DALAA reads the page or file you pick. Nothing changes in Canvas. When you&apos;ve connected, come back here and reload.</p>
      </EmptyState>
    );
  } else if (!listed.ok) {
    const problem = PROBLEMS[listed.reason];
    const fix =
      listed.reason === "not-linked" ? (
        <Link href={`/courses/${course.id}/canvas`} className={buttonStyles.primary}>
          Connect to Canvas
        </Link>
      ) : listed.reason === "reconnect" || listed.reason === "wrong-canvas" ? (
        <a href={connectHref} target="_blank" rel="noreferrer" className={buttonStyles.primary}>
          {listed.reason === "reconnect" ? "Reconnect Canvas ↗" : "Switch Canvas connection ↗"}
        </a>
      ) : null;
    body = (
      <EmptyState title={problem.title} action={fix}>
        <p>{problem.body}</p>
      </EmptyState>
    );
  } else if (listed.list.pages.length + listed.list.files.length === 0) {
    body = (
      <EmptyState title="Nothing in this Canvas course to use yet">
        <p>DALAA can use Canvas pages and PDF, .txt or .md files. Add one in Canvas, or upload or paste your material instead.</p>
      </EmptyState>
    );
  } else {
    const item = (pick: string, title: string, detail: string) => (
      <li key={pick}>
        <PickForm courseId={course.id} creationKey={randomUUID()} pick={pick} next={next} here={here} guide={guide}>
          <span className="break-words font-medium">{title}</span>
          <span className="text-sm text-muted">{detail}</span>
        </PickForm>
      </li>
    );
    const list = "flex flex-col divide-y divide-border rounded-panel border border-border bg-surface";
    body = (
      <>
        {listed.list.pages.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-lg font-semibold">Pages</h3>
            <ul className={list}>
              {listed.list.pages.map((p) => item(`page:${p.url}`, p.title, p.published ? "Page" : "Page · not published"))}
            </ul>
          </section>
        )}
        {listed.list.files.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-lg font-semibold">Files</h3>
            <ul className={list}>{listed.list.files.map((f) => item(`file:${f.id}`, f.display_name, "File"))}</ul>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={back} className="-mb-2 text-sm text-muted hover:text-text">
        ← Back
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Use a Canvas page or file</h2>
        <p className="text-muted">
          {guide
            ? "Pick the guide only the AI reads: an answer key or teaching note. Students never see it."
            : "Pick what students should study."}{" "}
          DALAA keeps a copy of its text for this course.
        </p>
      </div>
      {saved && (
        <p role="status" className="rounded-control border border-border bg-accent-soft px-4 py-3 text-sm">
          Saved &ldquo;{saved.name}&rdquo; to this course. You&apos;ll be able to choose it when you set up an activity.
        </p>
      )}
      {body}
    </div>
  );
}
