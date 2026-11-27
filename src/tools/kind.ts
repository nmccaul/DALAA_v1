/**
 * The kind of activity within its tool ("Argue · Pitch"), when the tool has
 * kinds. A tool registers how to read it from its settings (screens.ts); the
 * chassis shows it without knowing what it means.
 */

import type { ToolInfo } from "./catalog";

export type ActivityKind = {
  /** As the teacher reads it, e.g. "Argue · Pitch". */
  label: string;
  icon: ToolInfo["icon"];
};
