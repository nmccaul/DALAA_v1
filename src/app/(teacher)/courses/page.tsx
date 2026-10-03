import type { Metadata } from "next";
import Link from "next/link";
import { requireActor } from "@/auth/current";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { listTaughtCourses } from "@/courses/queries";
import { db } from "@/db/client";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const actor = await requireActor();
  const courses = await listTaughtCourses(db(), actor);

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title="Courses" />
        <EmptyState
          title="Add your first course"
          action={
            <>
              <ButtonLink href="/courses/new">Set up a course</ButtonLink>
              <span className="self-center text-sm text-muted">Bringing courses in from Canvas is coming soon.</span>
            </>
          }
        >
          <p>
            Give it a name and paste your class list. Your students can sign in with their NetID as
            soon as the course exists.
          </p>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Courses" action={<ButtonLink href="/courses/new">Add a course</ButtonLink>} />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <li key={c.id}>
            <Link
              href={`/courses/${c.id}`}
              className="flex h-full flex-col gap-1 break-words rounded-panel border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <span className="text-sm font-medium text-muted">{c.code}</span>
              <span className="font-display text-lg font-semibold leading-snug">{c.title}</span>
              <span className="mt-3 text-sm text-muted">
                {c.term}, {c.students} {c.students === 1 ? "student" : "students"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
