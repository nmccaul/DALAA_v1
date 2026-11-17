"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** "Analyze conversations": says it's working while the AI reads, which takes about a minute. */
export function BriefButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-1">
      <Button variant={variant} className="self-start" disabled={pending}>
        <span aria-hidden>✨</span>
        {pending ? "Reading the conversations…" : label}
      </Button>
      {pending && (
        <p role="status" className="text-sm text-muted">
          This takes about a minute. Keep this page open.
        </p>
      )}
    </div>
  );
}
