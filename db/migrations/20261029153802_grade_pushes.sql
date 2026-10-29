-- Every "Send grades to Canvas", for every tool (CLAUDE.md: grades post on an
-- explicit push). One row per push, and one per student DALAA tried to send.
-- A student counts as sent only when Canvas answered 2xx; the last sent score
-- for a gradebook column is what "changed in Canvas" is measured against
-- (src/results/push-plan.ts).
create table grade_pushes (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references activities(id) on delete cascade,
  -- Client-generated, so a resent click doesn't send twice.
  client_key    uuid not null,
  pushed_by     uuid not null references users(id),
  -- The gradebook column the scores went to (AGS line item URL).
  line_item_url text not null check (line_item_url <> ''),
  started_at    timestamptz not null default now(),
  -- What the push did, for a replayed click. NULL while it's still sending.
  summary       jsonb check (jsonb_typeof(summary) = 'object'),
  finished_at   timestamptz,
  check ((summary is null) = (finished_at is null)),
  unique (activity_id, client_key)
);

create table grade_push_lines (
  push_id  uuid not null references grade_pushes(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  score    numeric(8, 2) not null check (score >= 0),
  status   text not null check (status in ('sent', 'failed')),
  sent_at  timestamptz not null default now(),
  primary key (push_id, user_id)
);

create index grade_push_lines_user_idx on grade_push_lines (user_id, sent_at desc) where status = 'sent';

alter table grade_pushes enable row level security;
alter table grade_push_lines enable row level security;
