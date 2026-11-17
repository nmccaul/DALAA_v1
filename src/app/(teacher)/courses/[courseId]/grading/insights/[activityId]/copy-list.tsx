"use client";

import { useState } from "react";

/** Copies the questions to raise in class, one a line, for slides or notes. */
export function CopyList({ lines }: { lines: readonly string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-sm font-medium text-accent-text hover:underline"
      onClick={() => {
        navigator.clipboard
          .writeText(lines.map((line, i) => `${i + 1}. ${line}`).join("\n"))
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
