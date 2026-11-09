"use client";

import { BookOpenText, Books, GearSix } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The three top-level areas, and only three (CLAUDE.md product rule 2).
const AREAS = [
  { href: "/courses", label: "Courses", icon: BookOpenText },
  { href: "/library", label: "Library", icon: Books },
  { href: "/settings", label: "Settings", icon: GearSix },
] as const;

function useCurrent() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

/** The main areas down Canvas-style navy rail, icon over label, on wide screens. */
export function SideNav() {
  const isCurrent = useCurrent();
  return (
    <nav aria-label="Main" className="flex flex-col">
      {AREAS.map(({ href, label, icon: Icon }) => {
        const current = isCurrent(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex flex-col items-center gap-1 px-1 py-2.5 text-xs transition-colors ${
              current ? "bg-white text-accent" : "text-white hover:bg-white/10"
            }`}
          >
            <Icon size={26} weight={current ? "fill" : "regular"} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The same areas across the navy bar, on phones and narrow windows. */
export function TopNav() {
  const isCurrent = useCurrent();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 overflow-x-auto">
      {AREAS.map(({ href, label }) => {
        const current = isCurrent(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`shrink-0 rounded-control px-3 py-1.5 text-sm ${
              current ? "bg-white font-bold text-accent" : "text-white hover:bg-white/10"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
