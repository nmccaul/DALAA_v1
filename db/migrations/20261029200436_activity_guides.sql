-- The AI-only guide: a teaching note, answer key or argument framework the
-- chat model and the grader read, and students never do (T40). Kept apart
-- from course_content, which students read, so no student query can reach a
-- guide by joining the wrong table: only src/content/guide.ts reads this.
-- Same intake as course_content (src/content/read.ts).
create table course_guides (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  source        text not null check (source in ('paste', 'upload', 'canvas-page', 'canvas-file')),
  name          text not null check (name <> ''),
  body          text not null check (body <> ''),
  -- Client-generated; a retried save returns the same row.
  creation_key  uuid not null unique,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  -- So an activity can point at a guide from its own course only.
  unique (id, course_id)
);

create index course_guides_course_idx on course_guides (course_id, created_at);

alter table course_guides enable row level security;

-- The activity's guide, from the same course. NULL when it has none.
alter table activities
  add column guide_id uuid,
  add constraint activities_guide_same_course
    foreign key (guide_id, course_id) references course_guides (id, course_id);
