"use client";

import { CaretDown } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { PracticeTag } from "@/components/practice-tag";
import type { Tab } from "@/components/tab-match";
import { useDismiss } from "@/components/use-dismiss";
import { switchHref, type SwitcherCourse } from "@/courses/switcher";

/**
 * The course name in the breadcrumb, as a menu of the teacher's other
 * courses (feedback e77d9cdb). Picking one keeps the tab you're on. Only
 * drawn outside Canvas, where DALAA shows its own navigation (D-032).
 */
export function CourseSwitcher({
  name,
  base,
  tabs,
  courses,
}: {
  name: string;
  base: string;
  tabs: readonly Tab[];
  courses: readonly SwitcherCourse[];
}) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);
  const close = () => ref.current?.removeAttribute("open");

  if (courses.length === 0) return <span>{name}</span>;

  const item = "flex items-center gap-2 px-4 py-2.5 text-text hover:bg-subtle";
  return (
    <details ref={ref} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-control px-1 -mx-1 hover:bg-subtle [&::-webkit-details-marker]:hidden">
        {name}
        <span className="sr-only">(switch course)</span>
        <CaretDown size={14} weight="bold" aria-hidden className="text-muted" />
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-[min(20rem,calc(100vw-7rem))] rounded-panel border border-border-strong bg-surface py-1 text-base shadow-lg">
        <p className="px-4 pt-1.5 pb-1 text-sm text-muted">Switch to</p>
        {courses.map((c) => (
          <Link key={c.id} href={switchHref(tabs, path, base, c.id)} onClick={close} className={item}>
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">{c.name}</span>
              <span className="text-sm text-muted">{c.term}</span>
            </span>
            {c.isPractice && <PracticeTag />}
          </Link>
        ))}
        <div className="my-1 border-t border-border" />
        <Link href="/courses" onClick={close} className={item}>
          All courses
        </Link>
      </div>
    </details>
  );
}
