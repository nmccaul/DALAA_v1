import { requireActor } from "@/auth/current";
import { signOut } from "./sign-in/actions";

// Placeholder until the UI shell (Courses · Library · Settings) lands — ROADMAP Phase 1, PR 3.
export default async function Home() {
  const actor = await requireActor();
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-3 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome, {actor.displayName}</h1>
      <p className="text-lg opacity-80">
        Signed in as {actor.netId}
        {actor.isAdmin ? " · admin" : actor.isStaff ? " · instructor" : ""}
      </p>
      <form action={signOut}>
        <button className="text-sm underline">Sign out</button>
      </form>
    </main>
  );
}
