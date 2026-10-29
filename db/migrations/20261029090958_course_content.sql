-- What students study: text a teacher pasted, or a file they uploaded, kept as
-- plain text (src/content/intake.ts). It belongs to the course, not to one
-- activity, so the create flow can take it in before the activity exists and
-- a second activity can reuse it. Students read it, so it is never hidden
-- material; teaching notes don't go here.
create table course_content (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  -- Where it came from. Canvas pages and files arrive later (T16).
  source        text not null check (source in ('paste', 'upload', 'canvas-page', 'canvas-file')),
  -- What the teacher sees it called: the file name, or a title.
  name          text not null check (name <> ''),
  body          text not null check (body <> ''),
  -- Client-generated; a retried save returns the same row.
  creation_key  uuid not null unique,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  -- So an activity can point at content from its own course only.
  unique (id, course_id)
);

create index course_content_course_idx on course_content (course_id, created_at);

alter table course_content enable row level security;

-- The content an activity is built from, from the same course. NULL until the
-- teacher picks some (and a NULL leaves the course check unconstrained).
alter table activities
  add column content_id uuid,
  add constraint activities_content_same_course
    foreign key (content_id, course_id) references course_content (id, course_id);
