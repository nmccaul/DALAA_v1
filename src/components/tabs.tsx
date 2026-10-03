"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = {
  href: string;
  label: string;
  /** match only this exact path (plus `also`) */
  exact?: boolean;
  /** other path prefixes that belong to this tab */
  also?: string[];
};

/** Links that show which one you're on. Used for the main areas and inside a course. */
export function Tabs({ tabs, label }: { tabs: readonly Tab[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex items-center gap-1 overflow-x-auto">
      {tabs.map(({ href, label: text, exact, also = [] }) => {
        const under = (p: string) => path === p || path.startsWith(`${p}/`);
        const current = (exact ? path === href : under(href)) || also.some(under);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`shrink-0 rounded-control px-3 py-2 text-sm font-medium transition-colors ${
              current ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text"
            }`}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
