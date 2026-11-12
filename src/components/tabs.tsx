"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrentTab, type Tab } from "./tab-match";

export type { Tab };

/** Links that show which one you're on. Used for the main areas and inside a course. */
export function Tabs({ tabs, label }: { tabs: readonly Tab[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mb-px flex items-end gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const { href, label: text } = tab;
        const current = isCurrentTab(tab, path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`shrink-0 border-b-[3px] px-4 py-2.5 text-base transition-colors ${
              current
                ? "border-accent font-bold text-text"
                : "border-transparent text-accent-text hover:border-border-strong hover:text-accent"
            }`}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
