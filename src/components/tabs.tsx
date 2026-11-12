"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isCurrentTab, type Tab } from "./tab-match";

export type { Tab };

/**
 * Links that show which one you're on. Used for the main areas and inside a
 * course. On a phone the row scrolls sideways, so the current tab is scrolled
 * into view.
 */
export function Tabs({ tabs, label }: { tabs: readonly Tab[]; label: string }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);
  return (
    <nav ref={nav} aria-label={label} className="-mb-px flex items-end gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const { href, label: text } = tab;
        const current = isCurrentTab(tab, path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`shrink-0 border-b-[3px] px-3 py-2.5 sm:px-4 text-base transition-colors ${
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
