# One pass of the overnight build

You are one pass of an unattended build loop on DALAA_v1
(`/Users/natesmacbookair/Desktop/volli/DALAA_v1`, branch `feat/creation-wizard`).
Nobody is watching, and nobody will answer questions until morning. Do exactly
**one task**, leave everything committed and recorded, then stop.

## 1. Orient (keep it short)
1. Read `ralph/PLAN.md` (what and why), `ralph/TASKS.md` (pick the first `[ ]`
   task), and the last ~60 lines of `ralph/PROGRESS.md` (what earlier passes did).
2. Read `CLAUDE.md` and `AGENTS.md`. Next 16 differs from what you remember, so
   read the relevant guide in `node_modules/next/dist/docs/` before using a Next
   API you're unsure of.
3. `git status`: you must be on `feat/creation-wizard`. If the tree is dirty from
   a pass that crashed, finish that work if it's clearly the current task,
   otherwise `git stash` it and note that in PROGRESS.
4. Local database: if nothing listens on 127.0.0.1:54329, start
   `npm run db:local` in the background, then `npm run migrate`.

## 2. Build the task
- Follow `CLAUDE.md` exactly: match surrounding code, one place per concept,
  invariants as constraints or tests, plain language in the UI, chassis vs
  tools, all Canvas HTTP in `src/canvas/` or `src/lti/` service modules, NULL is
  not zero, RLS on every new table, never edit an applied migration.
- Write tests with the code. Tests use PGlite (no network); mock the AI and
  Canvas. Real AI or Canvas calls only in the smoke steps a task names.
- Keep diffs small. If the task is too big, split it in `ralph/TASKS.md` into
  sub-tasks and do only the first.
- Need a library? Choose a widely used, maintained one, pin it with npm, and
  say why in PROGRESS.

## 3. Check, commit, record
1. `npm run lint && npm run typecheck && npm test` must pass. Fix what you
   broke. Don't skip or delete tests to get green. Local Node is 20: the two
   PDF tests in `src/content/read.test.ts` (`Array.fromAsync`) are the only
   acceptable local failures; CI (Node 22) is the real gate at checkpoints.
2. Commit with explicit paths (`git add <paths>`, never `git add -A`). Use a
   plain, descriptive message. **No `Co-Authored-By` trailer and no "Generated
   with Claude" line.**
3. Push the branch: `git push -u origin feat/creation-wizard`.
4. In `ralph/TASKS.md`, mark the task `[x]` (or update its attempts / BLOCKED).
5. Append to `ralph/PROGRESS.md`:
   `## <UTC time> · T<nn> <title> · done|partial|blocked`, then 2–6 bullets:
   what changed, files, anything surprising, anything Nathan must do or check.
6. Commit and push the `ralph/` updates too.

## Checkpoint procedure (only on CHECKPOINT tasks)
1. Everything is green and pushed.
2. New migrations since the last checkpoint must all be additive (create
   table/index, add nullable column). If any isn't, mark the checkpoint
   `BLOCKED: non-additive migration` and stop.
3. Apply them to production first with `scripts/migrate-prod.sh` (it pulls
   production's env to a private temp file, migrates, deletes the file, and
   never prints the URL). It must end with `migrations up to date`.
4. Open or reuse a PR from `feat/creation-wizard` to `main` (`gh pr create` /
   `gh pr view`). The body summarizes what's in it. No Claude attribution.
   Turn on auto-merge with `gh pr merge --auto --merge` (Nathan's standing
   authorization, 2026-11-08/09: build, apply migrations, merge on green CI,
   deploy); GitHub merges when the required `ci-ok` check passes. Then wait
   (at most 10 minutes; check `gh pr view --json state` once first) for the
   PR to be MERGED. If `ci-ok` fails → fix it in this pass if small, else mark
   the checkpoint partial with the failing check. Stay on `feat/creation-wizard`
   afterwards and `git pull origin main`.
5. Wait for the production deployment of the merge: run
   `vercel -Q ~/.vercel-dalaa ls dalaa-v1 --format json` once and read it, then
   wait (8 minutes at most) for the `target: production` entry whose
   `meta.githubCommitSha` is the merged `main` HEAD to reach `READY`
   (`ERROR`/`CANCELED` = failed). Don't grep the table output and don't
   `vercel inspect` the alias (it shows the old deploy while the new builds).
6. Smoke test: `https://dalaa-v1.vercel.app/api/health` reports the database up,
   `/api/lti/jwks` returns a key, and `/` loads. If the smoke test fails, roll back
   (`vercel -Q ~/.vercel-dalaa rollback`), record why, and mark the checkpoint
   `BLOCKED`.

## Time limits (2026-10-29: a pass waited 20+ minutes on a command that failed every 2 minutes)
- Nothing in a pass runs open-ended. Give every long command a limit, and never wait on a background process, server or loop for more than 10 minutes.
- Before polling for a condition, run the check once and look at the real output, so you know the condition can match.
- The same step failing twice the same way means stop: record what failed (the exact error) in PROGRESS, mark the task partial, and end the pass. Don't retry a third time.
- The whole pass is killed after 40 minutes; split work so a pass finishes well inside that.

## Hard rules
- **Secrets:** never print, echo, log or commit the values in `.env.local` or
  Vercel env. Check a secret by its presence or length only. Don't edit
  `.env.local` except to add a missing **non-secret** var named in PLAN.
- **Never** push to `main` directly, force-push, rewrite history, `reset --hard`,
  or delete branches. Never run SQL by hand against production. Never apply a
  non-additive migration to production.
- Don't touch `docs/DALAA-VS-CANVAS.md` (Nathan's uncommitted file), other
  repos (read them only), or the gitgrade instance's other tools and keys.
- **Don't copy code from `~/Desktop/volli/scholarly`.** Write LTI fresh from
  the spec. MakeTheCase and agent-team-kit are references for ideas only.
- If you need something only Nathan can give (a secret, a decision, a click in
  Canvas), mark the task `BLOCKED: needs Nathan — <what>`, record it, and move on
  to the next task in the same pass only if this pass hasn't done any work yet.
- If every task is `[x]` or `[!]`, write `DONE` to `ralph/STATUS`, commit,
  and stop.

End your pass with one line: `PASS RESULT: T<nn> done|partial|blocked`.
