"use client";

import { CaretDown } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";
import { keepPicker } from "@/lti/picker";
import { isLive, newActivityPath, TOOLS } from "@/tools/catalog";
import { buttonStyles } from "./ui";
import { useDismiss } from "./use-dismiss";

/**
 * "+ Activity" as a menu of activity types (feedback b6714065): the live ones
 * start that type's first step, the rest show as Coming soon. It replaces the
 * old "What kind of activity?" page. `picker` keeps Canvas's Add to Canvas
 * request on the way through.
 */
export function ActivityMenu({
  courseId,
  picker = null,
  align = "right",
}: {
  courseId: string;
  picker?: string | null;
  /** Which edge the menu lines up with on wider screens; on a phone it always opens to the right of the button's left edge. */
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);
  const close = () => ref.current?.removeAttribute("open");

  return (
    <details ref={ref} className="relative">
      <summary className={`${buttonStyles.primary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        + Activity
        <CaretDown size={14} weight="bold" aria-hidden />
      </summary>
      <div className={`absolute left-0 ${align === "right" ? "sm:right-0 sm:left-auto" : ""} z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-border-strong bg-surface py-1 text-base shadow-lg`}>
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const body = (
            <>
              <span style={{ color: tool.accent }} className="mt-0.5">
                <Icon size={22} weight="duotone" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-bold">{tool.name}</span>
                <span className="text-sm text-muted">{tool.students}</span>
              </span>
            </>
          );
          return isLive(tool) ? (
            <Link
              key={tool.slug}
              href={keepPicker(newActivityPath(courseId, tool), picker)}
              onClick={close}
              className="flex items-start gap-3 px-4 py-2.5 text-text hover:bg-subtle"
            >
              {body}
            </Link>
          ) : (
            <div key={tool.slug} aria-disabled className="flex items-start gap-3 px-4 py-2.5 text-muted">
              {body}
              <span className="ml-auto shrink-0 rounded-control bg-bg px-2 py-0.5 text-xs font-medium">Coming soon</span>
            </div>
          );
        })}
        <div className="my-1 border-t border-border" />
        <Link href={keepPicker(`/courses/${courseId}?show=other`, picker)} onClick={close} className="block px-4 py-2.5 text-sm text-text hover:bg-subtle">
          Copy one from another course
        </Link>
      </div>
    </details>
  );
}
