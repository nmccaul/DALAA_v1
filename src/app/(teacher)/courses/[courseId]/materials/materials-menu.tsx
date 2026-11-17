"use client";

import { CaretDown, PencilSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";
import { buttonStyles } from "@/components/ui";
import { useDismiss } from "@/components/use-dismiss";
import { materialsMenuEntries } from "./menu-entries";

/** The "+ Materials" menu (D-032 mockup). */
export function MaterialsMenu({ base }: { base: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);

  const item = "flex items-start gap-3 px-4 py-2.5 hover:bg-subtle";

  return (
    <details ref={ref} className="relative">
      <summary className={`${buttonStyles.primary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        + Materials <CaretDown size={14} weight="bold" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-border-strong bg-surface py-1 shadow-lg">
        <p className="px-4 pt-2 pb-1.5 text-sm text-muted">
          This course&apos;s Canvas Pages and Files are already listed. Add anything else here.
        </p>
        {materialsMenuEntries(base).map(({ href, icon: Icon, title, help }) => (
          <Link key={title} href={href} className={`${item} text-text`}>
            <Icon size={22} aria-hidden className="mt-0.5 shrink-0" />
            <span className="flex flex-col">
              <span className="font-bold">{title}</span>
              <span className="text-sm text-muted">{help}</span>
            </span>
          </Link>
        ))}
        <div className="my-1 border-t border-border" />
        <Link href={`${base}/case-writer`} className={`${item} text-text`}>
          <PencilSimple size={22} aria-hidden className="mt-0.5 shrink-0" />
          <span className="flex flex-col">
            <span className="font-bold">Write a case with Case Writer</span>
            <span className="text-sm text-muted">AI helps you write a case and its teaching note</span>
          </span>
        </Link>
      </div>
    </details>
  );
}
