import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listStudentAssignments, type StudentAssignment } from "@/activities/queries";
import { takePath } from "@/attempts/store";
import { currentActor } from "@/auth/current";
import { passwordSettingEmail } from "@/auth/password";
import { FeedbackButton } from "@/components/feedback";
import { Landing } from "@/components/landing";
import { Logo } from "@/components/logo";
import { SetPassword } from "@/components/set-password";
import { EmptyState } from "@/components/ui";
import { listTakenCourses } from "@/courses/queries";
import { db } from "@/db/client";
import { findTool } from "@/tools/catalog";
import { signOut } from "./sign-in/actions";

export const metadata: Metadata = {
  title: { absolute: "DALAA: AI learning activities that show how students think" },
};

const dueFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function statusLabel(a: StudentAssignment): string {
  switch (a.status) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "submitted":
      return "Submitted, being graded";
    case "graded":
      return `Graded: ${pointsFormat.format(a.score!)} of ${pointsFormat.format(a.maxScore!)}`;
  }
}

/**
 * Visitors see the landing page. Teachers go to their courses; students see
 * their courses' assignments. A course-menu launch from Canvas adds
 * `?course=`, showing just that course. A student who signed up before ever
 * opening DALAA from Canvas has no courses yet, and is told the one thing
 * that fixes it.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const actor = await currentActor();
  if (!actor) return <Landing />;
  if (actor.isStaff) redirect("/courses");
  const [taken, assignments, email] = await Promise.all([
    listTakenCourses(db(), actor),
    listStudentAssignments(db(), actor),
    passwordSettingEmail(db(), actor.userId),
  ]);
  const { course, password } = await searchParams;
  const only = taken.filter((c) => c.id === course);
  const courses = only.length > 0 ? only : taken;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-10 pb-24">
      <Logo height={32} />
      <h1 className="font-display text-3xl font-semibold tracking-tight break-words">Hi, {actor.displayName}</h1>
      {courses.length === 0 ? (
        <EmptyState title="Open DALAA once from your Canvas course">
          <p>
            You&apos;re signed in, but DALAA doesn&apos;t know your courses yet. Go to your course in
            Canvas and click the DALAA link (in the course menu or an assignment). After that, your
            course shows up here.
          </p>
        </EmptyState>
      ) : (
        <>
          {courses.map((c) => {
            const mine = assignments.filter((a) => a.courseId === c.id);
            return (
              <section key={c.id} className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{c.code}</h2>
                  <p className="text-sm text-muted">
                    {c.title} · {c.term}
                  </p>
                </div>
                {mine.length === 0 ? (
                  <p className="rounded-panel border border-border bg-surface px-4 py-3 text-sm text-muted">
                    No assignments yet.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
                    {mine.map((a) => {
                      const tool = findTool(a.tool);
                      const Icon = tool?.icon;
                      return (
                        <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {Icon && (
                              <span style={{ color: tool.accent }}>
                                <Icon size={22} weight="duotone" aria-hidden />
                              </span>
                            )}
                            <div className="flex min-w-0 flex-col">
                              <Link href={takePath(a.id)} className="font-medium break-words hover:underline">
                                {a.title}
                              </Link>
                              <span className="text-sm text-muted">
                                {a.dueAt ? `Due ${dueFormat.format(a.dueAt)}` : "No due date"} ·{" "}
                                {pointsFormat.format(a.points)} {a.points === 1 ? "point" : "points"}
                              </span>
                            </div>
                          </div>
                          <span className={`pl-[34px] text-sm sm:pl-0 sm:text-right ${a.status === "graded" ? "font-medium" : "text-muted"}`}>
                            {statusLabel(a)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {only.length > 0 && taken.length > 1 && (
            <Link href="/" className="text-sm text-muted underline hover:text-text">
              All your courses
            </Link>
          )}
          <p className="text-sm text-muted">You can also open each assignment from Canvas.</p>
        </>
      )}
      {email && (
        <details className="text-sm" open={typeof password === "string"}>
          <summary className="cursor-pointer text-muted hover:text-text">Sign in without Canvas</summary>
          <div className="mt-4 text-base">
            <SetPassword email={email} status={typeof password === "string" ? password : undefined} back="/" />
          </div>
        </details>
      )}
      <form action={signOut}>
        <button className="text-sm text-muted underline hover:text-text">Sign out</button>
      </form>
      <FeedbackButton />
    </main>
  );
}
