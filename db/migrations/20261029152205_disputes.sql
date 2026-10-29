-- A student asking their teacher to look at a grade again, for every tool.
-- At most one open dispute per attempt; once the teacher resolves it the
-- student may dispute again. Resolving never changes the grader's score: a
-- changed grade is the teacher's score on `results`.
create table disputes (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts(id) on delete cascade,
  -- Client-generated, so a resubmitted form doesn't open a second dispute.
  client_key  uuid not null,
  reason      text not null check (btrim(reason) <> ''),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  opened_at   timestamptz not null default now(),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  -- The teacher's answer to the student. NULL when they wrote none.
  response    text check (btrim(response) <> ''),
  check ((status = 'resolved') = (resolved_by is not null)),
  check ((status = 'resolved') = (resolved_at is not null)),
  check (response is null or status = 'resolved'),
  unique (attempt_id, client_key)
);

create unique index disputes_one_open_idx on disputes (attempt_id) where status = 'open';

alter table disputes enable row level security;
