import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { FeedbackButton } from "@/components/feedback";
import { Logo } from "@/components/logo";
import { SideNav, TopNav } from "@/components/main-nav";
import { signOut } from "../sign-in/actions";

/**
 * The teacher shell: logo, the three areas, and who's signed in. Staff only.
 * Wide screens get the areas in a bar down the side; narrow ones get tabs
 * across the top.
 */
export default async function TeacherLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  if (!actor.isStaff) redirect("/");

  const signOutButton = (
    <form action={signOut}>
      <button className="rounded-control px-2 py-1 whitespace-nowrap text-muted hover:text-text">Sign out</button>
    </form>
  );

  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </a>
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-8 border-r border-border bg-surface px-4 py-6 lg:flex">
          <Link href="/courses" className="px-3" aria-label="DALAA home">
            <Logo />
          </Link>
          <SideNav />
          <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4 text-sm">
            <span className="truncate px-2 text-text">{actor.displayName}</span>
            {signOutButton}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur lg:hidden">
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
              <Link href="/courses" className="shrink-0" aria-label="DALAA home">
                <Logo compact />
              </Link>
              <TopNav />
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="hidden max-w-48 truncate text-muted sm:inline">{actor.displayName}</span>
                {signOutButton}
              </div>
            </div>
          </header>
          <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-10 pb-24 sm:px-6 lg:px-10">
            {children}
          </main>
        </div>
      </div>
      <FeedbackButton />
    </>
  );
}
