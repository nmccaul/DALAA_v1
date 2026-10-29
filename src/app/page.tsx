import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor } from "@/auth/current";
import { Landing } from "@/components/landing";
import { Logo } from "@/components/logo";
import { EmptyState } from "@/components/ui";
import { listTakenCourses } from "@/courses/queries";
import { db } from "@/db/client";
import { signOut } from "./sign-in/actions";

export const metadata: Metadata = {
  title: { absolute: "DALAA: AI learning activities that show how students think" },
};

/**
 * Visitors see the landing page. Teachers go to their courses; students land
 * here until activities exist. A student who signed up before ever opening
 * DALAA from Canvas has no courses yet, and is told the one thing that fixes it.
 */
export default async function Home() {
  const actor = await currentActor();
  if (!actor) return <Landing />;
  if (actor.isStaff) redirect("/courses");
  const courses = await listTakenCourses(db(), actor);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4">
      <Logo height={32} />
      <h1 className="font-display text-3xl font-semibold tracking-tight">Hi, {actor.displayName}</h1>
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
          <ul className="flex flex-col gap-2">
            {courses.map((c) => (
              <li key={c.id} className="rounded-panel border border-border bg-surface px-4 py-3">
                <p className="font-medium">{c.code}</p>
                <p className="text-sm text-muted">
                  {c.title} · {c.term}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted">
            When your instructor shares an activity, open its link from Canvas and it will bring you
            straight to it.
          </p>
        </>
      )}
      <form action={signOut}>
        <button className="text-sm text-muted underline hover:text-text">Sign out</button>
      </form>
    </main>
  );
}
