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

## 2026-11-09 08:08 UTC · T10 Canvas client + column · done
- Migration `20261109080544_activity_canvas_assignment.sql` (additive): nullable `activities.canvas_assignment_id text` (check `<> ''`) and a partial unique index on (course_id, canvas_assignment_id) where not null. Applied locally only; checkpoint D applies it to production.
- `src/canvas/client.ts`: `assignmentGroups`, `createAssignment` (POST), `updateAssignment` (PUT), `AssignmentInput` and `assignmentBody`. Sent as a JSON body `{ assignment: … }`; dates ISO; on update a field left out is untouched and a `null` date clears it (JSON null, never `''`). Only a reply with a numeric id counts as done. `request()` now takes a method.
- Practice Canvas: `practiceCanvas` is now async; it lists assignment groups (two per practice course, `PRACTICE_ASSIGNMENT_GROUPS`) and keeps created assignments in process memory (lost on restart), checking name, points, dates and group like Canvas. The route also exports POST/PUT.
- `materials.test.ts` backfill test expected its migration to be the last one; now it checks it runs first.
- Same 12 Node-20 `Array.fromAsync` failures locally, nothing new.

## 2026-11-09 08:11 UTC · T11 Launch finds the activity from the link URI · done
- `src/lti/launch.ts`: new exported `launchActivityId(claims)` — the `activity_id` custom field when present, else `activity_id` from the target link URI's query; only a UUID counts (lowercased). `linkedActivity` uses it, so the same-course check and first-launch recording of resource link + line item apply to both.
- A custom field that is present but not a UUID does not fall back to the URI (the task says fallback only when the field is missing).
- Tests in `src/lti/deep-link.test.ts`: link-URI launch opens and records link + line item; activity in another DALAA course and a non-UUID value open the course and record nothing; unit test of the precedence rules.
- Same 12 Node-20 `Array.fromAsync` failures locally, nothing new.

## 2026-11-09 08:16 UTC · T12a assignActivity · done
- T12 split: T12a (service, this pass) and T12b (Assign dialog + due-date edit behind `ASSIGN_TO_CANVAS`).
- `src/activities/assign.ts` `assignActivity(db, actor, canvas, activityId, { dueAt, lockAt, groupId, publish }, appUrl)`: publishes in DALAA (`publishActivity`), then creates the external-tool assignment (launch URL `<APP_URL>/api/lti/launch?activity_id=…`) or updates the one in `canvas_assignment_id`; stores the id and `due_at`. The activity row is locked (`for update`) while Canvas is asked, so a double click makes one assignment.
- Departures from the task text: **points aren't an input** — Canvas gets the activity's own points (they follow the rubric; one place per concept, no rescaling). `appUrl` is a 6th argument (callers pass `appUrl(request)` / `APP_URL`). An activity already linked from Canvas the old way (`lti_resource_link_id`, no `canvas_assignment_id`) is refused rather than given a second assignment that would split its grades.
- Publishing uses the chassis `publishActivity` (points check only), not `publishStudyChat`'s schema check, since the chassis can't branch on the tool. T12b's action should run the tool's publish first, or the catalog should register a publish check.
- `listCourseActivities` counts `canvas_assignment_id` as assigned. 11 tests in `assign.test.ts`. Same 12 local failures as before (Node 20; note: `progress.test.ts`/`work.test.ts` are in that 12 too, not only `read.test.ts`).

## 2026-11-09 08:24 UTC · T12b Assign UI · done
- New page `courses/[courseId]/activities/[activityId]/assign` (+ `assign-form.tsx`, `actions.ts`): due, closes, assignment group (from `assignmentGroups`, by position), "Students can see it in Canvas now". For an activity with a `canvas_assignment_id` the same page is "Change the due date" with only the due field. 404 unless `ASSIGN_TO_CANVAS=1`. Not connected / reconnect links to `/canvas/connect?next=<assign page>`; course not linked links to the course's Connect to Canvas page; added-from-Canvas activities are told to change dates in Canvas.
- Activities tab (flag on): *Not assigned* rows get **Assign**; *Assigned* rows with a `canvas_assignment_id` get **Change due date**. Flag off: unchanged.
- `src/activities/assign.ts`: `lockAt` and `publish` are now optional (left out on update = unchanged in Canvas, so the due-date edit doesn't clear the close date or unpublish); new `assignToCanvasOn()`, `assignSetup()` and `assignRequestFrom(form)`. Dates go to the server as ISO from the browser (teacher's zone), via `localInputValue` in `components/time.ts`. `appUrlFromHeaders` in `lti/config.ts` for server actions (APP_URL wins).
- Checked locally with playwright-cli: practice course BUS M 499 imported for `ralph.t04`, an activity copied in, assigned (group "Case discussions", due Feb 1 11:59 PM) → moved to Assigned; Change due date → Feb 3 5:00 PM saved. 390px fine. Dark mode not screenshotted (tokens only).
- Added `ASSIGN_TO_CANVAS=1` to local `.env.local` (non-secret, named in PLAN) so the running dev server on :3000 shows it. Production stays off.
- Publishing still uses the chassis `publishActivity` (points check), not Study Chat's schema check — fine while every save is schema-checked, but a tool publish hook in the catalog would be cleaner later. Same 12 Node-20 local failures, nothing new.

## 2026-11-09 08:33 UTC · T13 CHECKPOINT D · done
- Green locally (lint, typecheck; tests: the same 12 Node-20 failures only). One new migration since checkpoint C, `20261109080544_activity_canvas_assignment.sql` (additive: nullable column + partial unique index), applied to production with `scripts/migrate-prod.sh` → `migrations up to date`.
- PR #126 (feat/creation-wizard → main): Canvas assignment client, link-URI launch fallback, `assignActivity`, Assign UI behind `ASSIGN_TO_CANVAS`. CI passed in 5m17s, merged; main is `feb13a4`.
- Production deploy of `feb13a4` READY. Smoke: `/api/health` `{"ok":true,"db":"up"}`, `/api/lti/jwks` returns an RSA key, `/` 200. `ASSIGN_TO_CANVAS` stays unset in production.
- VERIFY (Nathan): set ASSIGN_TO_CANVAS=1 locally or in a preview, assign in gitgrade course 42, open it as Student View from Canvas Assignments, chat, grade, send grade; then turn the flag on in production.

## 2026-11-09 12:42 UTC · T14a Wizard shell + step 1 Materials · done
- T14 split: T14a (shell + step 1 pick, this pass), T14b (step 1's "+ Materials" link with `next` support, Case Writer chip, `+ Activity` going straight to the wizard). A crashed pass had left `parseCanvasPick`/`canvasPickValue` and `MaterialRow.savedId`/`canvas` uncommitted; finished and committed with this task.
- `src/tools/study-chat/wizard/`: `steps.ts` (7 steps), `shell.tsx` (`WizardShell`), `picks.ts` (`pickValue`, `parsePicks`, `pickCreationKey`, `savePicks`, `materialsQuery`/`materialsFromQuery`), `materials-step.tsx` + `materials-form.tsx`; `wizardMaterialsAction` in `study-chat/actions.ts`. `StudyChatCreate` routes `?step=materials` to the wizard; other step slugs show a Preview note ("isn't built yet"); no `?step=` keeps the old flow.
- A Canvas pick's creation key is derived (sha256 → UUID shape) from the form's random key + the pick, so resending the same form saves each page once. Ticked ids are checked as this course's before going on.
- `loadMaterialRows` and `CANVAS_PROBLEM` moved into `src/content/materials.ts` (the Materials tab uses them too).
- Surprise: React 19 resets the form after a server action, which unticked boxes after an error; the action now returns `ticked` and the boxes use it as their default.
- Checked locally (playwright-cli, ralph.t04, course "T04 check"): notes-only refused with a sentence and ticks kept; reading + note → step 2 with both ids; Back keeps both ticked; 390px fine. Canvas-item picking not exercised in the browser (practice Canvas lists ralph.t04 as not a teacher of BUS M 499); covered by tests. Same 12 Node-20 local test failures, nothing new.

## 2026-11-09 12:47 UTC · T14b Step 1 links + entry · done
- Step 1 has a "+ Materials" row (Upload a file · Paste text · Add a web page) and a disabled "Write a new case with Case Writer · Coming soon"; it moved out of the panel's chips. The empty course now shows the form with "Add one below" instead of pointing at the Materials tab.
- `next` on `materials/new`: `src/content/return-path.ts` (`materialReturnPath` accepts only a path inside the same course; `afterAddPath` appends `added=content:<id>`/`guide:<id>`). Both add forms and the web form carry it; "‹ Back to the new activity" when present. The wizard's `materialsFromQuery` counts `added` as ticked.
- The links read the boxes as ticked at click time (client `router.push`), so ticks made before clicking survive. Unsaved Canvas Page/File ticks are not carried (only saved ids travel in the URL).
- `materialsQuery`/`materialsFromQuery` moved from `picks.ts` to the client-safe `wizard/query.ts` (picks.ts imports node:crypto). `newActivityPath` in `src/tools/catalog.ts` (tool registers `start`): "+ Activity" on the Activities tab and the course checklist go straight to `study-chat?step=materials` while it's the only live tool.
- Checked locally (playwright-cli, ralph.t04, "T04 check"): ticked a reading, Paste text → AI-only note saved → back on step 1 with both ticked; 390px fine. Same 12 Node-20 local test failures, nothing new.

## 2026-11-09 12:53 UTC · T15 Suggest goal + step 2 · done
- `src/tools/study-chat/suggest.ts`: `suggestGoal(db, model, ctx, { readings, guides })` → `{ ok, goal }`; one `generateStructured` call, purpose `suggest.goal`, readings and AI-only notes fenced as in drafting; any failure, blank or over-600-character answer is `{ ok: false }` (no retry, it's only a suggestion). Tests in `suggest.test.ts` (mock model).
- Step 2 (`wizard/goal-step.tsx`, routed from `create-screen.tsx`): textarea pre-filled with the suggestion, "About how long?" (10–15 / 20–30 / 45+, default 20–30), Activity group and Start from disabled "Coming soon". A plain GET form: Next goes to `?step=type&content=…&guide=…&goal=…&minutes=…`. If the AI fails the field is empty with a one-line note. Coming back from step 3 shows the teacher's own goal and asks the AI nothing.
- `wizard/picks.ts` `pickedMaterials` loads the URL's ids in order (teacher-only, same course, combined 150,000-character cap). `wizard/query.ts`: `MINUTES`, `goalFromQuery`, `goalStepPath`. Step 3 is still the "isn't built yet" note, now with "← Back to the learning goal".
- Checked locally (playwright-cli, ralph.t04, "T04 check", real AI via gateway): reading + note → a suggested goal; edited it, picked 45+, Next → step 3 URL; Back → same goal and length. 390px fine. First live answer used markdown italics, so the prompt now says plain text.
- The suggestion runs on every load of step 2 without `goal` in the URL (a reload costs one more call). Same 12 Node-20 local test failures, nothing new.
