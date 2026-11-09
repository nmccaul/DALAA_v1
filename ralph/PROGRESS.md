# Progress

One entry per pass, newest last. Run started 2026-11-09: creation wizard,
several materials per activity, reuse across courses, Library removed, Assign
to Canvas. See `ralph/PLAN.md` and `ralph/TASKS.md`. The previous run is in
`ralph/archive/2026-10-29-study-chat-lti/`.

## 2026-11-09 07:15 UTC · T01 Decisions + ideas · done
- Added D-034 to `docs/DECISIONS.md` (wizard order, several materials, Coming-soon shown not hidden, Library removed, Assign behind `ASSIGN_TO_CANVAS`); the open D-013 row now points at it ("still open for BYU").
- `CLAUDE.md` product rule 2 and `docs/PRD.md` goal 2 / next-term reuse now say **Courses · Settings**, reuse in the Activities tab.
- `docs/IDEAS.md`: new section listing the wizard chat panel and each Coming-soon option. `.env.example`: `ASSIGN_TO_CANVAS=`.
- There is no D-033 in DECISIONS; numbered D-034 as the task said. Nathan: renumber if D-033 was meant to exist.
- Local tests: 12 failures, all `Array.fromAsync` on Node 20 — not only the two PDF tests but also helpers in `study-chat/progress.test.ts` (9) and `work.test.ts` (1). Pre-existing; CI (Node 22) is the gate. Treat these as acceptable local failures too.

## 2026-11-09 07:19 UTC · T02 activity_materials table · done
- Migration `20261109071641_activity_materials.sql` (additive): adds `unique (id, course_id)` on activities, the `activity_materials` table (exactly one of content_id/guide_id, same-course FKs, partial unique indexes per kind, RLS) and backfills reading at position 0, guide at 1. Applied locally.
- `src/activities/materials.ts`: `activityMaterials`, `activityReadings` (readings only — what student paths should use in T03), `setActivityMaterials` (replaces the set, dedupes, refuses non-teacher and other-course materials before touching rows).
- Guide reads stay in `src/content/guide.ts` (new `activityGuides`, `guidesInCourse`), keeping it the only reader of `course_guides`.
- `src/test/db.ts`: `testDb({ before })` + `migrateRest()` so a migration's backfill can be tested.
- Local `npm run migrate` needs `.env.local` loaded into the shell (`set -a; . ./.env.local`). Same 12 Node-20 `Array.fromAsync` failures, nothing new.

## 2026-11-09 07:28 UTC · T03 Readers take lists · done
- `draftPrompt`/`chatSystemPrompt`/`gradePrompt`/`studentPrompt` take `readings[]` and `guides[]`, each fenced under its own name (`material.ts` `Material`, `guideBlocks`); single-material wording unchanged. `chat.ts`, `grade.ts`, `trial.ts` read `activityGuides`/`activityMaterials`; `aiGuide` removed.
- Student side: `TakenActivity.content` → `readings[]` from `activityReadings` (never touches `course_guides`/`guide_id`); take screen shows every reading. New guide.test cases prove two notes reach the chat model and never the student payload.
- Cap: `MAX_MATERIALS_CHARS = 150_000` / `materialsTooLong` in `src/activities/materials.ts`, enforced in `setActivityMaterials` and `createStudyChat` (before any model call). `guidesInCourse` now returns id → length.
- Bridge until T04: `createActivity` and `setActivityGuide` also write `activity_materials` from `content_id`/`guide_id`, so the new readers see activities made by the old writers. Test fixtures that insert activities by hand call `mirrorMaterials`.
- Same 12 Node-20 `Array.fromAsync` failures locally, nothing new.
