-- The student's own work (T40b): a paper, code or plan the student adds at
-- the start of a chat whose activity asks for it. One per attempt, kept with
-- the attempt; the chat model and the grader read it as data, and the
-- student sees it on their own page. Same intake and limits as course
-- content (src/content/read.ts). Written and read only by
-- src/attempts/work.ts. The attempt is the key, so a retried upload returns
-- the first one instead of a second copy.
create table attempt_work (
  attempt_id  uuid primary key references attempts(id) on delete cascade,
  source      text not null check (source in ('paste', 'upload')),
  name        text not null check (name <> ''),
  body        text not null check (body <> ''),
  created_at  timestamptz not null default now()
);

alter table attempt_work enable row level security;
