import Link from "next/link";
import { requireActor } from "@/auth/current";
import { Logo } from "@/components/logo";
import { signOut } from "../sign-in/actions";

/** The student shell: logo, who's signed in, and the activity. No areas to navigate; a student is here for one thing. */
export default async function StudentLayout({ children }: LayoutProps<"/activities">) {
  const actor = await requireActor();

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="shrink-0" aria-label="DALAA home">
            <Logo />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            <span className="truncate text-muted">{actor.displayName}</span>
            <form action={signOut}>
              <button className="rounded-control px-2 py-1 text-muted hover:text-text">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
