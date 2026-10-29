/**
 * One real Study Chat draft through `src/tools/study-chat/draft.ts`, from the
 * practice "Case: Harbor Bikes" page, with GRADER_MODEL. Prints the drafted
 * settings (already validated by the schema) or the refusal.
 *   npx tsx --env-file=.env.local scripts/draft-smoke.mts [mode|suggest]
 */

import { graderModel } from "../src/ai/models";
import { PRACTICE_PAGES } from "../src/canvas/practice/data";
import { readContent } from "../src/content/read";
import { db } from "../src/db/client";
import { draftSettings } from "../src/tools/study-chat/draft";
import { MODE_SLUGS, type ModeSlug } from "../src/tools/study-chat/modes";

const arg = process.argv[2] ?? "case-chat";
if (arg !== "suggest" && !(MODE_SLUGS as readonly string[]).includes(arg)) {
  console.error(`Mode must be "suggest" or one of: ${MODE_SLUGS.join(", ")}`);
  process.exit(1);
}

const page = PRACTICE_PAGES.get(1101)!.find((p) => p.url === "case-harbor-bikes")!;
const content = await readContent({ kind: "canvas-page", name: page.title, html: page.body ?? "" });
if (!content.ok) throw new Error(content.reason);

const result = await draftSettings(db(), graderModel(), {}, {
  content: content.body,
  contentName: content.name,
  mode: arg as ModeSlug | "suggest",
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
