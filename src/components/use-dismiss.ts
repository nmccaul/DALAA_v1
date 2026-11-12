"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a `<details>` menu on Escape (focus goes back to its summary) or on
 * a click outside it. The one way our dropdown menus close.
 */
export function useDismiss(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        menu.open = false;
        if (menu.contains(document.activeElement)) menu.querySelector("summary")?.focus();
      } else if (!menu.contains(e.target as Node)) {
        menu.open = false;
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [ref]);
}
