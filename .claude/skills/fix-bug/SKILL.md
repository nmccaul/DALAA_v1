---
name: fix-bug
description: Load a DALAA feedback report by id and start fixing it. Use when the user says "fix bug <id>", "/fix-bug <id>", or pastes a feedback_reports id (full UUID, or the first 8 characters shown on Settings → Feedback reports). Pulls the report, its console and errors and the screenshot into .bugs/, then verifies the claim before changing any code.
---

# fix-bug: load a feedback report and fix it

Someone (a teacher, a student, or Nathan) used the **Feedback** button on a
signed-in page. The report is a row in `feedback_reports`
(`db/migrations/*_feedback_reports.sql`, written by `src/feedback/store.ts`):
the kind (`bug`, `confusing`, `idea`), what they wrote, the page URL, a JPEG of
the page, the last 25 console warnings/errors and thrown errors, the viewport
and colour scheme, and the deployed commit (`app_commit`, NULL on a local
build). Admins read the same thing at `/settings/feedback/<id>`.

## Input

A report id, full or its first 8 characters. Call it `$ID`.

## Procedure

1. **Pick the database.** `npm run feedback` reads `DATABASE_URL` from the
   shell (it does not read `.env.local`). Local is the README's
   `postgresql://postgres@127.0.0.1:54329/postgres?sslmode=disable`. Reports
   filed on production live in production's database; only use it if Nathan
   says so, pass it inline without printing it, and remember the script is
   read-only on purpose. Never run SQL by hand against production.

2. **Pull the bundle:**

   ```bash
   DATABASE_URL=… npm run feedback -- show $ID
   ```

   It writes `.bugs/<short id>/report.md` (readable summary),
   `context.json` (everything captured) and `screenshot.jpg` (or `.png`) when
   there was one. No row, or more than one for a short prefix: stop and say so.

3. **Lead with what they saw and said.** View the screenshot first, then read
   their note in `report.md`. Only then read the errors and console lines,
   which corroborate and localize. The URL tells you the route; ids in it
   (`/courses/<id>/…`, `/activities/<id>`) name the exact course or activity.
   If `app_commit` is set, the bug was seen on that build: `git log
   <app_commit>..main` shows whether it's already been changed since.

4. **Verify the claim before touching code.** A report is an observation plus,
   usually, a theory about the cause. Keep them apart and treat the theory as
   a hypothesis to disprove.
   - Read the code path the report names. The most common false fix is adding
     something that already exists.
   - Reproduce it. A thrown error in the bundle is a repro to confirm in code.
     A behaviour complaint with no error needs the app: `npm run dev` (Node
     22) against the local database, sign in as the right role (teacher, or a
     student through the stand-in), open the same kind of page and do the same
     thing. Check light, dark and 390px if it's visual (CLAUDE.md).
   - Decide which it is. Only the first changes code:

   | Finding | Action |
   |---|---|
   | Real bug, reproduced | fix it (step 5) |
   | Works as designed | don't change code; tell Nathan plainly how it works |
   | Confusing but not broken | usually a wording or layout change, not the fix they asked for; decide deliberately |
   | Can't reproduce | don't guess-fix; say what you tried and leave it open |

   A `confusing` report counts: CLAUDE.md's two product rules (60-minute
   setup, obvious UI) make confusion a real defect. An `idea` is a product
   decision; record it for Nathan rather than building it.

5. **Fix the failure you reproduced**, not the reporter's guess at the cause
   if it turned out to be elsewhere. Follow CLAUDE.md as for any change: a
   test that fails before the fix, `npm run lint && npm run typecheck && npm
   test`, a small PR to `main`. Mention the report's short id in the commit
   message (`… (feedback 84b05db6)`).

6. **Close it.** After the fix is merged and deployed, an admin opens
   `/settings/feedback/<id>` and clicks **Mark resolved** with the fix's short
   SHA (blank when nothing needed changing). There is no hook that does it for
   you.

7. **`.bugs/` stays local.** It's gitignored; never commit it. Screenshots can
   show student names, work and grades. Delete the folder when you're done.

## Notes

- The database row is the source of truth; re-run `show` rather than trusting
  an old `.bugs/` copy.
- No screenshot (left out, or the capture failed): carry on; the URL, errors
  and console usually point at it.
- Captured text was scrubbed of tokens, `state=`/`token=` query values and
  JWTs before it was saved, so a `[redacted]` in a URL is expected, not the
  bug.
