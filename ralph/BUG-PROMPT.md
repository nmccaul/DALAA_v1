# One pass of the bug loop

You are one pass of the bug loop on DALAA_v1 (D-030 in `docs/DECISIONS.md`).
`ralph/bugs.sh` started you in a git worktree checked out at `origin/main`
(detached), separate from the build loop's checkout. Nobody is watching. Do
exactly **one report**, record what you did, then stop.

## 1. Orient (keep it short)
1. Read `CLAUDE.md`, `AGENTS.md` and `.claude/skills/fix-bug/SKILL.md`. You
   follow that skill; this prompt only adds what the loop needs.
2. `git status` must be clean and detached at `origin/main`. If it isn't, stop
   with `BUG RESULT: none blocked (dirty worktree)`.
3. Local database: if nothing listens on 127.0.0.1:54329, start
   `npm run db:local` in the background, then `npm run migrate`.

## 2. Pick and claim
1. `npm run -s feedback -- list --prod`. Lines are oldest first, `bug` and
   `confusing` before `idea`. Take the **first line that doesn't end in
   `in_progress`** (those are PRs waiting for Nathan). None: stop with
   `BUG RESULT: none`.
2. `npm run -s feedback -- claim <short> --prod --branch fix/feedback-<short>`.
   Refused means another pass has it: stop with `BUG RESULT: <short> skipped`.
3. `npm run -s feedback -- show <short> --prod`, then the skill's steps 3–4:
   screenshot and note first, then errors; verify the claim before any code.

## 3. Act on what you found
- **Real bug, reproduced:** `git checkout -b fix/feedback-<short> origin/main`.
  Write the failing test first, then the fix. `npm run lint && npm run
  typecheck && npm test` must pass. Commit with explicit paths, message ends
  `(feedback <short>)`, push, `gh pr create --base main` with the short id in
  the title and what you reproduced in the body. Then decide if it's **small**:
  all checks green, no migration, nothing under `src/auth/`, `src/lti/`,
  `src/canvas/` or grade sending, no dependency change, under ~200 changed
  lines (`git diff --stat origin/main`). Write which rule failed, if one did.
  - Small: `gh pr merge --merge`. Wait for the production deployment of the
    merge (`vercel -Q ~/.vercel-dalaa ls dalaa-v1 --prod`; up to 10 minutes),
    check `https://dalaa-v1.vercel.app/api/health` reports the database up,
    then `resolve <short> <merge sha> --prod`. If the deploy fails or health
    is down, roll back (`vercel -Q ~/.vercel-dalaa rollback`) and `record
    <short> in_progress --pr <url> --note "<what broke>"` instead.
  - Not small: `record <short> in_progress --pr <url> --note "<why it needs
    Nathan's merge>"`.
- **Works as designed:** `record <short> wont_fix --note "<how it works, in
  plain words>"`.
- **Can't reproduce:** `record <short> cant_reproduce --note "<what you
  tried>"`.
- **Confusing:** treat as a bug if a wording or layout change clears it up;
  if it needs a product decision, record `needs_nathan` with the question.
- **Idea:** never build it. On branch `fix/feedback-<short>`, append to
  `docs/IDEAS.md` (create it with a one-line heading if missing): date, short
  id, the idea in one or two sentences, a one-line opinion. PR it to `main`
  (don't merge), then `record <short> needs_nathan --pr <url>`.

Every `record`/`resolve` takes `--prod`. Notes are what Nathan reads on the
admin report page: say plainly what you found and did.

## Hard rules
- Everything in `ralph/PROMPT.md` "Hard rules" applies: never print secrets
  or `.env.local`/Vercel values; never push to `main` directly, force-push,
  rewrite history, `reset --hard` or delete branches; never run SQL by hand
  against production; never touch the gitgrade instance's other tools or keys.
- Production data is read through `npm run feedback -- … --prod` only. Its
  `list`/`show` are read-only; `claim`/`record`/`resolve` touch only the fix
  row and the report's resolve columns.
- Only the small-fix rule above lets you merge your own PR.
- `.bugs/` is never committed (screenshots show student work); delete
  `.bugs/<short>/` before you stop.
- Don't touch the build loop's checkout or its branch `feat/study-chat-lti`.
- No `Co-Authored-By` trailer and no "Generated with Claude" line.

End your pass with one line:
`BUG RESULT: <short> fixed|in_progress|wont_fix|cant_reproduce|needs_nathan|skipped`.
