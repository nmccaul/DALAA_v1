"use client";

import { Button } from "@/components/ui";

/** Opens the feedback panel that every signed-in page already has (components/feedback.tsx). */
export function GiveFeedback() {
  return (
    <Button type="button" className="self-start" onClick={() => window.dispatchEvent(new Event("open-feedback"))}>
      Give feedback
    </Button>
  );
}
