"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often to look for the grade, and when to stop looking (a grading that slow has likely failed). */
const EVERY_MS = 5_000;
const GIVE_UP_MS = 3 * 60_000;

/** Re-renders the page every few seconds while a grade is on its way. Renders nothing. */
export function RefreshWhileGrading() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) clearInterval(timer);
      else router.refresh();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
