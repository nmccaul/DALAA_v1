import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { CanvasError } from "@/canvas/client";
import { clientFor } from "@/canvas/connection";
import { listImportable, type ImportableCourse } from "@/canvas/import";
import { VaultError } from "@/canvas/vault";
import { Button, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { importCourseAction } from "./actions";

export const metadata: Metadata = { title: "Bring in from Canvas" };

const ERRORS: Record<string, string> = {
  "not-yours": "Canvas doesn't list you as a teacher of that course.",
  taken: "Another instructor already brought that course into DALAA. Ask them to add you.",
  "section-taken": "One of that course's sections is already in another DALAA course (it's cross-listed).",
  reconnect: "Canvas didn't accept your saved token. It may have expired.",
  unavailable: "We couldn't reach Canvas just now. Try again in a minute.",
};

const reconnect = (
  <ButtonLink href="/canvas/connect?next=/courses/import" variant="secondary">
    Reconnect Canvas
  </ButtonLink>
);

export default async function ImportPage({ searchParams }: PageProps<"/courses/import">) {
  const actor = await requireActor();
  const { error } = await searchParams;

  let canvas;
  try {
    canvas = await clientFor(db(), actor);
  } catch (e) {
    if (!(e instanceof VaultError)) throw e;
    return <Problem message={ERRORS.reconnect} action={reconnect} />;
  }
  if (!canvas) redirect("/canvas/connect?next=/courses/import");

  let courses: ImportableCourse[];
  try {
    courses = await listImportable(db(), actor, canvas);
  } catch (e) {
    const expired = e instanceof CanvasError && e.kind === "token-rejected";
    return <Problem message={expired ? ERRORS.reconnect : ERRORS.unavailable} action={expired ? reconnect : undefined} />;
  }

  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <>
      <Link href="/courses" className="-mb-4 text-sm text-muted hover:text-text">
        ← All courses
      </Link>
      <PageHeader
        title="Bring in from Canvas"
        description="Pick a course. DALAA brings in its sections and class list. Nothing changes in Canvas."
      />
      {canvas.mode === "practice" && (
        <p className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          You&apos;re using practice Canvas: these courses and students are made up.{" "}
          <Link href="/canvas/connect?next=/courses/import" className="underline">
            Connect your real Canvas
          </Link>
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-danger">
          {message}
        </p>
      )}

      {courses.length === 0 ? (
        <EmptyState title="No courses found in Canvas">
          <p>Canvas doesn&apos;t list any current or upcoming courses where you&apos;re a teacher.</p>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 break-words rounded-panel border border-border bg-surface p-5">
              <span className="text-sm font-medium text-muted">{c.course_code}</span>
              <span className="font-display text-lg font-semibold leading-snug">{c.name}</span>
              <span className="text-sm text-muted">
                {c.term?.name ?? "No term"}
                {c.total_students !== undefined && `, ${c.total_students} ${c.total_students === 1 ? "student" : "students"}`}
              </span>
              <div className="mt-4">
                {c.dalaaCourseId ? (
                  <ButtonLink href={`/courses/${c.dalaaCourseId}`} variant="secondary">
                    Open in DALAA
                  </ButtonLink>
                ) : (
                  <form action={importCourseAction}>
                    <input type="hidden" name="canvasCourseId" value={c.id} />
                    <input type="hidden" name="creationKey" value={randomUUID()} />
                    <Button>Bring in</Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">
        Course not in Canvas?{" "}
        <Link href="/courses/new" className="underline hover:text-text">
          Set it up yourself
        </Link>
      </p>
    </>
  );
}

function Problem({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Bring in from Canvas" />
      <EmptyState title="Canvas needs attention" action={action}>
        <p>{message}</p>
      </EmptyState>
    </>
  );
}
