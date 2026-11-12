-- The AI class-prep brief for an activity (D-035): what the class found
-- confusing, what it did well, the questions it asked, and questions to raise
-- in class, read from every finished conversation. One row per activity, made
-- only when the teacher asks; kept until they refresh it.
create table class_briefs (
  activity_id   uuid primary key references activities(id) on delete cascade,
  -- The last brief that came back, and how many finished conversations it
  -- read. NULL until one has.
  brief         jsonb check (jsonb_typeof(brief) = 'object'),
  conversations integer check (conversations >= 0),
  generated_at  timestamptz,
  generated_by  uuid references users(id),
  -- Set while a brief is being made; one older than 10 minutes belongs to a
  -- request that died and may be taken over.
  running_since timestamptz,
  -- When the last try failed, so the page can say so; cleared on success.
  failed_at     timestamptz,
  check ((brief is null) = (generated_at is null)),
  check ((brief is null) = (conversations is null))
);

alter table class_briefs enable row level security;
