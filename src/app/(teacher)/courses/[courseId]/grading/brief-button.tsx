"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** "Analyze conversations": says it's working while the AI reads, which takes a minute or two. */
export function BriefButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" className="self-start" disabled={pending}>
        {pending ? "Reading the conversations…" : label}
      </Button>
      {pending && (
        <p role="status" className="text-sm text-muted">
          This takes a minute or two. Keep this page open.
        </p>
      )}
    </div>
  );
}
