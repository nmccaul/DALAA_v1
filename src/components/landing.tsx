/**
 * The public home page, for anyone not signed in. Copy comes from
 * docs/strategy/positioning.md and the pitch deck. Rules for this page:
 * no statistics we can't cite, no claim of BYU approval (positioning.md),
 * real product screenshots only (public/landing, retake when the UI changes).
 */

import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonStyles } from "@/components/ui";
import { TOOLS } from "@/tools/catalog";

const WALKTHROUGH_URL = "https://calendly.com/nathanmccauley10/30min";

function Walkthrough({ className = "" }: { className?: string }) {
  return (
    <a href={WALKTHROUGH_URL} target="_blank" rel="noreferrer" className={`${buttonStyles.primary} ${className}`}>
      Book a walkthrough
    </a>
  );
}

/** A real screenshot of the app, swapping to the dark-mode capture with the system theme. */
function Shot({ name, alt, width, height, priority = false }: { name: string; alt: string; width: number; height: number; priority?: boolean }) {
  const frame = "w-full rounded-panel border border-border shadow-[0_24px_60px_-24px_rgb(13_16_42/0.25)]";
  return (
    <>
      <Image src={`/landing/${name}.png`} alt={alt} width={width} height={height} priority={priority} className={`${frame} dark:hidden`} />
      <Image src={`/landing/${name}-dark.png`} alt={alt} width={width} height={height} priority={priority} className={`${frame} hidden dark:block`} />
    </>
  );
}

const QUADRANTS = [
  { row: "Non-technical classes", col: "Prohibit AI", text: "AI detectors and proctoring. An arms race that treats AI only as cheating." },
  { row: "Non-technical classes", col: "Allow AI", text: "Structured activities where using AI well is the assignment.", dalaa: true },
  { row: "Technical classes", col: "Prohibit AI", text: "Proctoring plus code-recording plugins to prove the work is the student's own." },
  { row: "Technical classes", col: "Allow AI", text: "Students build with AI coding tools. Using them well is the skill." },
];

export function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="DALAA home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Page" className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#tools" className="hover:text-text">Tools</a>
            <a href="#how" className="hover:text-text">How it works</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/sign-in" className="whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium text-muted hover:text-text">
              Sign in
            </Link>
            <span className="hidden sm:block">
              <Walkthrough />
            </span>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <p className="text-sm font-medium text-accent-text">Piloting with BYU instructors, Winter 2027</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-balance md:text-5xl">
              AI learning activities that show how students think.
            </h1>
            <p className="max-w-[46ch] text-lg text-muted">
              Case discussions, quizzes and explain-it-back activities that connect to your Canvas course and show you
              what your class understands.
            </p>
            <div className="flex flex-wrap gap-3">
              <Walkthrough />
              <a href="#how" className={buttonStyles.secondary}>
                See how it works
              </a>
            </div>
          </div>
          <Shot name="tools" alt="Choosing a tool for a new activity in DALAA" width={2400} height={1520} priority />
        </section>

        {/* The problem and the gap */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-balance md:text-4xl">
                Students adapted to AI. Most assignments haven&apos;t.
              </h2>
              <p className="max-w-[60ch] text-muted">
                Students changed how they work almost overnight. Most assignments still grade a finished product, and a
                polished essay no longer proves understanding.
              </p>
              <p className="max-w-[60ch] text-muted">
                Classes that ban AI have detectors and proctoring. Technical classes that allow it have real tools. But
                a history, business or writing class that allows AI has little more than &ldquo;tell us how you used
                it.&rdquo; That&apos;s the gap DALAA fills.
              </p>
            </div>
            <div role="table" aria-label="Where AI tools exist today" className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm">
              <span role="columnheader" />
              {["Prohibit AI", "Allow AI"].map((c) => (
                <span key={c} role="columnheader" className="px-3 pb-1 font-medium text-muted">{c}</span>
              ))}
              {["Non-technical classes", "Technical classes"].map((row) => (
                <div key={row} role="row" className="contents">
                  <span role="rowheader" className="flex items-center pr-2 font-medium text-muted [writing-mode:vertical-rl] rotate-180 sm:rotate-0 sm:[writing-mode:horizontal-tb]">
                    {row.replace(" classes", "")}
                  </span>
                  {QUADRANTS.filter((q) => q.row === row).map((q) => (
                    <div
                      key={q.col}
                      role="cell"
                      className={`flex flex-col gap-2 rounded-panel p-4 ${
                        q.dalaa ? "border-2 border-accent bg-accent-soft" : "border border-border bg-bg"
                      }`}
                    >
                      {q.dalaa && <span className="font-display text-base font-semibold text-accent-text">DALAA</span>}
                      <span className={q.dalaa ? "text-text" : "text-muted"}>{q.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tools */}
        <section id="tools" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-10 px-4 py-20 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Focused tools, not a prompt box.</h2>
            <p className="text-muted">
              Each activity is built around how that kind of learning works. They share one home that connects to Canvas,
              so setup takes minutes and grades flow back to your gradebook.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <li key={tool.slug} className="grid gap-4 py-8 md:grid-cols-[14rem_1fr_1fr] md:gap-10">
                  <span className="flex items-center gap-3 self-start">
                    <span style={{ color: tool.accent }}>
                      <Icon size={30} weight="duotone" aria-hidden />
                    </span>
                    <span className="font-display text-xl font-semibold">{tool.name}</span>
                  </span>
                  <p className="text-lg">{tool.students}</p>
                  <p className="text-muted">
                    <span className="block text-sm font-medium text-text">You get</span>
                    {tool.teacher}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Teachers and students */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <figure className="flex flex-col gap-3 rounded-panel border border-border bg-bg p-8">
              <span className="font-display text-7xl font-semibold tracking-tight text-accent-text">52%</span>
              <blockquote className="text-lg">
                of the class took this position. Click for anonymous quotes, then run the discussion.
              </blockquote>
              <figcaption className="text-sm text-muted">From a Case Chat in a BYU business class</figcaption>
            </figure>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">See how your class thinks.</h2>
                <ul className="flex flex-col gap-3 text-muted">
                  <li><strong className="font-medium text-text">Positions and themes</strong> across the class after every activity.</li>
                  <li><strong className="font-medium text-text">What each student understood</strong>, with evidence in their own words.</li>
                  <li><strong className="font-medium text-text">Grades post to Canvas when you say so</strong>, and never overwrite a grade you changed.</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <h3 className="font-display text-xl font-semibold">For students, AI becomes a sparring partner.</h3>
                <p className="text-muted">
                  They question it, defend a position to it and explain ideas to it. They learn the material more deeply,
                  and practice using AI the way they will at work.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[7fr_5fr]">
          <Shot name="canvas" alt="Bringing a course in from Canvas" width={2400} height={1120} />
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Set up in minutes, inside the course you already teach.</h2>
            <ol className="flex flex-col gap-5">
              {[
                ["Connect Canvas", "Paste a Canvas access token once. DALAA reads your courses; nothing changes in Canvas until you ask."],
                ["Bring in a course", "Pick it from your list. Sections and class list come with it, and students sign in with their NetID."],
                ["Choose what students do", "Pick a tool and give it your reading or case. DALAA drafts the activity for you to edit."],
              ].map(([title, body]) => (
                <li key={title} className="flex flex-col gap-1">
                  <h3 className="font-display text-lg font-semibold">{title}</h3>
                  <p className="text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Call to action */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Want DALAA in your class?</h2>
            <p className="max-w-[55ch] text-muted">
              We&apos;re working with a small group of instructors for Winter 2027. Book a walkthrough and we&apos;ll set up
              a course with you.
            </p>
            <div className="flex flex-wrap gap-3">
              <Walkthrough />
              <Link href="/sign-in" className={buttonStyles.secondary}>
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <Logo height={22} />
          <span>&copy; {new Date().getFullYear()} DALAA</span>
        </div>
      </footer>
    </div>
  );
}
