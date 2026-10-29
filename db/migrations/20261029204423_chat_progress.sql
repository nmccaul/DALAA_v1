-- Live tracking in a Study Chat (T42): after each reply the cheap check model
-- reads the chat and says which touchpoints the student has brought up so
-- far and which position they've taken. Each row copies the item's key and
-- label from the attempt's own settings (D-031), so a teacher's later edit
-- doesn't relabel what a student already covered. Written and read only by
-- src/tools/study-chat/progress.ts. The grader still judges from the
-- transcript; these are evidence, not a grade.

-- A touchpoint, once covered, stays covered. The key is the primary key's
-- second half, so tracking the same turn again adds nothing.
create table chat_touchpoints (
  attempt_id  uuid not null references attempts(id) on delete cascade,
  key         text not null check (key <> ''),
  label       text not null check (label <> ''),
  -- The turn after which the check first saw it.
  turn_id     uuid not null references chat_turns(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (attempt_id, key)
);

alter table chat_touchpoints enable row level security;

-- The position the student has taken, as of the latest turn that showed one.
-- A turn where the check sees none leaves it as it was.
create table chat_positions (
  attempt_id  uuid primary key references attempts(id) on delete cascade,
  key         text not null check (key <> ''),
  label       text not null check (label <> ''),
  turn_id     uuid not null references chat_turns(id) on delete cascade,
  updated_at  timestamptz not null default now()
);

alter table chat_positions enable row level security;
