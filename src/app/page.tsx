import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor } from "@/auth/current";
import { Landing } from "@/components/landing";
import { Logo } from "@/components/logo";
import { signOut } from "./sign-in/actions";

export const metadata: Metadata = {
  title: { absolute: "DALAA: AI learning activities that show how students think" },
};

/** Visitors see the landing page. Teachers go to their courses; students land here until activities exist. */
export default async function Home() {
  const actor = await currentActor();
  if (!actor) return <Landing />;
  if (actor.isStaff) redirect("/courses");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4">
      <Logo height={32} />
      <h1 className="font-display text-3xl font-semibold tracking-tight">Hi, {actor.displayName}</h1>
      <p className="text-muted">
        You&apos;re signed in. When your instructor shares an activity, open its link from Canvas and
        it will bring you straight to it.
      </p>
      <form action={signOut}>
        <button className="text-sm text-muted underline hover:text-text">Sign out</button>
      </form>
    </main>
  );
}
