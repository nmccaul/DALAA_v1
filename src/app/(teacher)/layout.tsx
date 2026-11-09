import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { FeedbackButton } from "@/components/feedback";
import { inFrame } from "@/components/embed";
import { SideNav, TopNav } from "@/components/main-nav";
import { signOut } from "../sign-in/actions";

/**
 * The teacher shell, Canvas-style (D-032). Inside Canvas (a frame), Canvas
 * draws the navigation, so only the content shows. On its own, a navy rail
 * like Canvas's global nav carries the three areas; narrow screens get them
 * as tabs across the top. Staff only.
 */
export default async function TeacherLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  if (!actor.isStaff) redirect("/");

  if (await inFrame()) {
    return (
      <>
        <main id="main" className="flex w-full flex-1 flex-col gap-6 px-6 pt-6 pb-24">
          {children}
        </main>
        <FeedbackButton />
      </>
    );
  }

  const signOutButton = (
    <form action={signOut}>
      <button className="rounded-control px-2 py-1 whitespace-nowrap text-white/80 hover:text-white hover:underline">
        Sign out
      </button>
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
        <aside className="sticky top-0 hidden h-dvh w-[84px] shrink-0 flex-col items-stretch gap-2 bg-accent py-3 text-white lg:flex">
          <Link href="/courses" className="flex justify-center py-2" aria-label="DALAA home">
            <Image src="/brand/dalaa-mark-dark.png" alt="" width={34} height={30} priority />
          </Link>
          <SideNav />
          <div className="mt-auto flex flex-col items-center gap-1 px-1 text-center text-xs">
            <span className="w-full truncate" title={actor.displayName}>
              {actor.displayName}
            </span>
            {signOutButton}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 bg-accent text-white lg:hidden">
            <div className="flex h-14 items-center gap-3 px-4">
              <Link href="/courses" className="shrink-0" aria-label="DALAA home">
                <Image src="/brand/dalaa-mark-dark.png" alt="" width={28} height={25} priority />
              </Link>
              <TopNav />
              <div className="ml-auto text-sm">{signOutButton}</div>
            </div>
          </header>
          <main id="main" className="flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-24 sm:px-8">
            {children}
          </main>
        </div>
      </div>
      <FeedbackButton />
    </>
  );
}
