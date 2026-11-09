"use client";

import { CaretDown, ClipboardText, File, FileText, Globe, PencilSimple, UploadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { buttonStyles } from "@/components/ui";

/** The "+ Materials" menu (D-032 mockup). Canvas items filter the list: those are already here. */
export function MaterialsMenu({ base }: { base: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  const item = "flex items-start gap-3 px-4 py-2.5 hover:bg-subtle";
  const entries = [
    { href: `${base}?source=canvas-page`, icon: FileText, title: "Link a Canvas Page", help: "Every page in this course's Pages is already listed" },
    { href: `${base}?source=canvas-file`, icon: File, title: "Link a Canvas File", help: "PDFs and text files from Files are already listed" },
    { href: null, icon: Globe, title: "Add a web page", help: "Coming soon: DALAA saves a copy of the page's text" },
    { href: `${base}/new?kind=upload`, icon: UploadSimple, title: "Upload a file", help: "Kept in DALAA, not in Canvas Files" },
    { href: `${base}/new?kind=paste`, icon: ClipboardText, title: "Paste text", help: "Notes, a transcript, an excerpt" },
  ];

  return (
    <details ref={ref} className="relative">
      <summary className={`${buttonStyles.primary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        + Materials <CaretDown size={14} weight="bold" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-border-strong bg-surface py-1 shadow-lg">
        {entries.map(({ href, icon: Icon, title, help }) => {
          const body = (
            <>
              <Icon size={22} aria-hidden className="mt-0.5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-bold">{title}</span>
                <span className="text-sm text-muted">{help}</span>
              </span>
            </>
          );
          return href ? (
            <Link key={title} href={href} className={`${item} text-text`}>
              {body}
            </Link>
          ) : (
            <span key={title} aria-disabled className={`${item} cursor-not-allowed text-muted opacity-70 hover:bg-transparent`}>
              {body}
            </span>
          );
        })}
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
