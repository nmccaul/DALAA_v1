import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { signOut } from "../sign-in/actions";

/** The teacher shell: logo, the three areas, and who's signed in. Staff only. */
export default async function TeacherLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  if (!actor.isStaff) redirect("/");

  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href="/courses" className="shrink-0" aria-label="DALAA home">
            <Logo />
          </Link>
          <NavLinks />
          <div className="ml-auto hidden items-center gap-3 text-sm sm:flex">
            <span className="max-w-48 truncate text-muted">{actor.displayName}</span>
            <form action={signOut}>
              <button className="rounded-control px-2 py-1 text-muted hover:text-text">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        {children}
      </main>
    </>
  );
}
