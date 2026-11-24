# Feedback batch: Gradebook, wizard, Activities tab, materials, Setup wording

Branch: `feat/feedback-nov23`

*Approved by Nathan 2026-11-23 ("sounds great, get going with it"). Source of
truth for this loop; the task list is `ralph/TASKS.md`, the running log is
`ralph/PROGRESS.md`. The previous run (creation wizard, 2026-11-09) is in
`ralph/archive/2026-11-09-creation-wizard/`.*

## Goal
Work through the open teacher feedback Nathan picked, mostly from Lucy
(Lucy Levie, a pilot teacher), in priority order. Each task names its reports.
Read a report in full, with its screenshot, before building:

```
npm run feedback -- show <id> --prod   # writes .bugs/<id>/report.md, context.json, screenshot
```

The screenshot's red marks are Lucy's: they point at what she means.

## How to treat the reports
- **Fix what she describes, the simplest way that reads obviously to a
  teacher** (CLAUDE.md product rules). Don't widen a task into a redesign.
- When a report asks for something that conflicts with a decision in
  `docs/DECISIONS.md`, keep the decision, do the part that doesn't conflict,
  and say so in PROGRESS.
- A change a teacher would notice gets a plain-language line in
  `src/help/release-notes.ts` under that day's date (create the date entry,
  newest first). A product decision gets a dated bullet under the closest
  D-entry in `docs/DECISIONS.md` ("Nathan, 2026-11-23, Lucy's <id>").
- **Don't resolve reports yourself while building.** At each checkpoint, after
  the merge is deployed and healthy, resolve the reports of the tasks it
  shipped:
  `npm run feedback -- resolve <id> <merged-sha> --pr <url> --note "<one line, plain>" --prod`.
  Only for tasks marked `[x]`; a partial task's reports stay open.

## Testing in the browser
Run the dev server (`npm run dev`), sign in on `/sign-in` with "Test sign-in
with a login ID": teacher `ralph.t04`, students `practice.*`. Check UI changes
at 1280px and 390px wide. Use `playwright-cli` (see its skill) or the local
browser tools. Leave local data as you found it (delete what you add through
the UI). Never touch production data except through the feedback CLI.

## Out of scope tonight
Insights (Nathan is still deciding its structure), saved personas/rubrics,
AI-generated readings, display settings, cost preview, sending scores
automatically, pass/fail for Liken to Me, the "Material condensed by
Professor …" line. Small wizard ideas (71a6e148, abe6f3bb, c5592f46, 4e057f48,
4f32e9c6, 738add12) are not queued.
