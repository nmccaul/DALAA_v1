"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The three top-level areas, and only three (CLAUDE.md product rule 2).
const AREAS = [
  { href: "/courses", label: "Courses" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" },
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {AREAS.map(({ href, label }) => {
        const current = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-control px-3 py-2 text-sm font-medium transition-colors ${
              current ? "bg-accent-soft text-accent-text" : "text-muted hover:text-text"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
