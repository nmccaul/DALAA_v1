"use client";

import { BookOpenText, Books, GearSix } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs } from "./tabs";

// The three top-level areas, and only three (CLAUDE.md product rule 2).
const AREAS = [
  { href: "/courses", label: "Courses", icon: BookOpenText },
  { href: "/library", label: "Library", icon: Books },
  { href: "/settings", label: "Settings", icon: GearSix },
] as const;

/** The main areas down the side of the teacher shell, on wide screens. */
export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {AREAS.map(({ href, label, icon: Icon }) => {
        const current = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors ${
              current ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-bg hover:text-text"
            }`}
          >
            <Icon size={20} weight={current ? "duotone" : "regular"} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The same areas as tabs across the top, on phones and narrow windows. */
export function TopNav() {
  return <Tabs tabs={AREAS.map(({ href, label }) => ({ href, label }))} label="Main" />;
}
