-- What someone saw go wrong (or found confusing, or wished for), sent from the
-- feedback button on any page, with enough context for whoever fixes it: the
-- page, a screenshot, the last console errors. Read in the admin list and by
-- the /fix-bug skill (.claude/skills/fix-bug/).
create table feedback_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id),
  -- Client-generated, so a retried send doesn't file the report twice.
  client_key      uuid not null,
  kind            text not null default 'bug' check (kind in ('bug', 'confusing', 'idea')),
  note            text not null check (btrim(note) <> '' and char_length(note) <= 2000),
  url             text not null check (char_length(url) <= 2000),
  -- The capture bundle (src/feedback/report.ts): viewport, console, errors…
  context         jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  -- NULL when the reporter left it out or the capture failed.
  screenshot      bytea check (octet_length(screenshot) <= 3145728),
  screenshot_type text check (screenshot_type in ('image/png', 'image/jpeg')),
  -- The deployed commit, stamped by the server; NULL when running locally.
  app_commit      text,
  status          text not null default 'open' check (status in ('open', 'resolved')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  -- Short SHA of the fix, when there was one.
  fixed_commit    text,
  check ((screenshot is null) = (screenshot_type is null)),
  check ((status = 'resolved') = (resolved_at is not null)),
  check (fixed_commit is null or status = 'resolved'),
  unique (user_id, client_key)
);

create index feedback_reports_created_idx on feedback_reports (created_at desc);

alter table feedback_reports enable row level security;
