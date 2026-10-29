-- A student's go at an activity, for every tool. v1 gives each student one
-- attempt per activity; retakes are a later choice and get their own column.
create table attempts (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references activities(id) on delete cascade,
  user_id      uuid not null references users(id),
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  -- What ended it: the turn limit, the time limit, the question answered, or
  -- the student. NULL while it's in progress.
  ended_by     text check (ended_by in ('turns', 'time', 'question', 'student')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (ended_by is not null)),
  check ((status = 'completed') = (completed_at is not null)),
  unique (activity_id, user_id)
);

create index attempts_user_idx on attempts (user_id);

alter table attempts enable row level security;

-- One exchange in a chat: what the student sent and the AI's reply. A turn
-- counts only once it's 'done': a failed reply costs the student nothing and
-- the same message can be sent again with the same key.
create table chat_turns (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts(id) on delete cascade,
  -- Client-generated, so a retried send returns the first reply instead of
  -- making a second turn or paying for a second call.
  client_key  uuid not null,
  message     text not null check (message <> ''),
  reply       text check (reply <> ''),
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  -- When the student (last) sent it: a retried failed turn moves to now, so
  -- the transcript keeps the order the conversation happened in.
  sent_at     timestamptz not null default now(),
  replied_at  timestamptz,
  check ((status = 'done') = (reply is not null)),
  check ((status = 'done') = (replied_at is not null)),
  unique (attempt_id, client_key)
);

-- One message at a time per chat, so two quick sends can't both slip under
-- the turn limit.
create unique index chat_turns_one_pending on chat_turns (attempt_id) where status = 'pending';
create index chat_turns_attempt_idx on chat_turns (attempt_id, sent_at);

alter table chat_turns enable row level security;
