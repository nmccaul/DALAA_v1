"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often to look for the grade, and when to stop looking (a grading that slow has likely failed). */
const EVERY_MS = 5_000;
const GIVE_UP_MS = 3 * 60_000;

/** Whether this page watched a grade being graded, so its arrival is news (ShowGradeOnArrival). */
let waiting = false;

/** Re-renders the page every few seconds while a grade is on its way. Renders nothing. */
export function RefreshWhileGrading() {
  const router = useRouter();
  useEffect(() => {
    waiting = true;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) clearInterval(timer);
      else router.refresh();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

/**
 * Takes the student to the top of their grade when it arrives while they
 * wait (feedback cdc2b58a: it appeared below, off screen). Not on a later
 * visit, when the grade is already there. Renders nothing.
 */
export function ShowGradeOnArrival({ targetId }: { targetId: string }) {
  useEffect(() => {
    if (!waiting) return;
    waiting = false;
    const target = document.getElementById(targetId);
    if (!target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }, [targetId]);
  return null;
}
