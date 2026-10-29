-- What the bug loop (D-030, ralph/bugs.sh) did about a feedback report: at most
-- one row per report, written by `npm run feedback -- claim|record|resolve`
-- (src/feedback/fixes.ts) and shown on the admin report page. A separate table
-- so feedback_reports' own open/resolved status stays as it is.
create table feedback_fixes (
  report_id  uuid primary key references feedback_reports(id),
  -- in_progress: claimed, or a PR is waiting for Nathan. Every other status
  -- closes the report for the loop.
  status     text not null check (status in ('in_progress', 'fixed', 'wont_fix', 'cant_reproduce', 'needs_nathan')),
  branch     text check (char_length(branch) <= 200),
  pr_url     text check (pr_url ~ '^https://' and char_length(pr_url) <= 500),
  note       text check (char_length(note) <= 2000),
  commit_sha text check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  updated_at timestamptz not null default now()
);

alter table feedback_fixes enable row level security;
