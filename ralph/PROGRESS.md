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

## 2026-11-09 07:35 UTC · T04 Writers use the list · done
- `createStudyChat` attaches materials with `setActivityMaterials`; `createActivity` no longer takes or mirrors `contentId`/`guideId` (and `TaughtActivity` dropped them). `setActivityMaterials` now also sets `activities.content_id`/`guide_id` to the first reading/note, so the columns stay written until T18 retires them.
- `setActivityGuide` replaced by `addActivityGuide` / `removeActivityGuide` (`src/activities/materials.ts`); the review screen and the Canvas picker add notes, and `RemoveGuideForm` removes one note by id. Adding a note from another course now says "We couldn't find one of those materials in this course."
- Review screen: a "Materials" list with every reading and note and its pill; the "Additional AI instructions" fold below always offers adding another. The pill is now the shared `src/components/seen-by-pill.tsx` (Materials tab uses it too; the wizard will).
- Materials tab "used in" reads `activity_materials` instead of the old columns.
- Checked locally on the running dev server (:3000): an activity with one reading and two notes lists all three with pills. A local-only user `ralph.t04` (staff allowlist) and course "T04 check" were added to the local DB for that.
- Same 12 Node-20 `Array.fromAsync` failures locally, nothing new.

## 2026-11-09 07:45 UTC · T05 CHECKPOINT B · done
- Green locally (lint, typecheck; tests: the same 12 Node-20 `Array.fromAsync` failures only). One new migration since main, `20261109071641_activity_materials.sql`: additive (new table, unique (id, course_id) over the PK, backfill inserts). Applied to production with `scripts/migrate-prod.sh` → `migrations up to date`.
- PR #124 (feat/creation-wizard → main), CI passed in 6m12s, merged; main is `c2ae5b9`.
- Production deploy of `c2ae5b9` READY. Smoke: `/api/health` `{"ok":true,"db":"up"}`, `/api/lti/jwks` returns an RSA key, `/` 200.
- Nathan: an activity created in production between the migration and the deploy (a few minutes, overnight) would have no `activity_materials` row; unlikely, but if one exists, re-attach its material on the review screen.

## 2026-11-09 07:49 UTC · T06 copyActivity · done
- `src/activities/copy.ts` `copyActivity`: one transaction — `createActivity` (target-course check, idempotent by `creationKey`; a retry short-circuits via `activityForKey`), then materials re-attached with `setActivityMaterials`. Copies title, tool, settings, points; status draft; no due date, no LTI link/line item, no attempts/results/grades.
- Cross-course materials go through new `copyTo` in `src/content/store.ts` (`copyContent`; `copyGuides` in `guide.ts`, so guide.ts stays the only reader of `course_guides`). Readings stay readings and notes stay notes.
- Choice not in the task: a material the target course already has word for word (same source, name, text) is reused rather than copied again, so copying several activities that share a case from last term doesn't fill the Materials tab with duplicates. Nathan: say if you'd rather always copy.
- Due date is deliberately not copied (a copy is usually for another term). `src/activities/copy.test.ts`: 6 tests. Same 12 Node-20 `Array.fromAsync` failures locally, nothing new.

## 2026-11-09 07:54 UTC · T07 Activities tab sections · done
- `listCourseActivities` rows now carry `assigned` (has `lti_resource_link_id`; add `canvas_assignment_id` in T09-era work). New `listOtherCourseActivities(db, actor, courseId)`: every activity in the teacher's other courses, drafts included, newest course first. `listLibraryActivities` is left for the Library page; T08 can delete it with the page.
- `courses/[courseId]/page.tsx`: *Assigned* section on top (same Canvas-style rows); filter pills `?show=unassigned` / `?show=other`; other courses grouped under "CODE · Term". Defaults to *From my other courses* when this course has nothing unassigned but other courses have activities. The empty state shows only when there's nothing anywhere.
- New `courses/[courseId]/actions.ts` `copyActivityAction` (Copy / Copy to this course, `creationKey` from `randomUUID()` at render), landing on the copy. A refusal shows a fixed sentence (`?copyerror=1`), never text from the URL.
- Checked locally with playwright-cli at desktop and 390px: three lists render; Copy and Copy to this course each opened the new draft. Local-only data added: course "T07 other" for `ralph.t04` and an activity with a fake LTI link `local-t07-link`. Dark mode not screenshotted (only design tokens used).
- Same 12 Node-20 `Array.fromAsync` failures locally, nothing new.

## 2026-11-09 07:56 UTC · T08 Library removed · done
- `main-nav.tsx`: Library dropped from `AREAS` (rail is Courses · Settings). `library/page.tsx` is now just `redirect("/courses")` (signed-out visitors still hit the sign-in guard first; checked with curl: 307 → /sign-in).
- The "Reuse it from your Library" line on the activity-type picker now links to `/courses/<id>?show=other` ("Copy it into this course").
- `listLibraryActivities` and its test deleted (no callers left); `LibraryActivity` type renamed `OtherCourseActivity`.
- No `/library` link remains in `src`. Lint, typecheck green; tests: the same 12 Node-20 `Array.fromAsync` failures only.

## 2026-11-09 08:05 UTC · T09 CHECKPOINT C · done
- Green locally (lint, typecheck; tests: the same 12 Node-20 `Array.fromAsync` failures only). No new migrations since checkpoint B, so nothing applied to production.
- PR #125 (feat/creation-wizard → main): copyActivity, Activities tab sections with Copy / Copy to this course, Library page removed. CI passed in 5m1s, merged; main is `3f33fad`.
- Production deploy of `3f33fad` READY. Smoke: `/api/health` `{"ok":true,"db":"up"}`, `/api/lti/jwks` returns an RSA key, `/` 200.
