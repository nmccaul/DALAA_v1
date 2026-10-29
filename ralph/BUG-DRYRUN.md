# DRY RUN: read this first

`ralph/bugs.sh` started this pass with `BUGS_PROD=` empty: a dry run against
the **local** database, to check the loop's mechanics. These rules override
the prompt below wherever they disagree.

- Every `npm run feedback` command runs without `--prod` (already removed
  below). Never touch production's database.
- The worktree may be detached at `$BUGS_REF` rather than `origin/main`; that
  counts as clean. Branch from that same commit (`git checkout -b
  fix/feedback-<short>`), not from `origin/main`.
- The seeded report is not a real bug. Treat it as reproduced. Its fix is to
  create `ralph/dryrun-<short>.md` with one line: the date and the short
  id. No failing test is needed for it, but run `npm run lint && npm run
  typecheck && npm test` as usual (put Node 22 first on PATH:
  `~/.nvm/versions/node/v22.23.3/bin`).
- Commit with an explicit path and push the branch. **Don't open a PR, don't
  merge, don't deploy, don't roll back.** Instead, write which small-fix rule
  failed (if any) and the exact `gh pr create` / `gh pr merge` commands you
  would have run.
- In place of the merge SHA, `resolve <short> <your commit's short sha>`
  locally. That exercises the record path the real merge would use.
- End with `BUG RESULT: <short> fixed (dry run)`.
