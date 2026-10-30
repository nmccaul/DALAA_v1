-- A teacher's "Try it with a sample student" run (T41). One row per teacher
-- while a trial runs, so a teacher runs one at a time; the row is deleted when
-- the trial ends. A row older than a trial can take belongs to a request that
-- died, and the next trial takes it over (src/tools/study-chat/trial.ts).
-- Nothing about the trial itself is stored: it isn't a student attempt.
create table sample_trials (
  user_id     uuid primary key references users(id) on delete cascade,
  started_at  timestamptz not null default now()
);

alter table sample_trials enable row level security;
