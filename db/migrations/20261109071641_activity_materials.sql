-- An activity's materials: any number of readings (course_content, students
-- read them) and AI-only notes (course_guides, they never do), in the order
-- the teacher picked them (D-034). Replaces activities.content_id / guide_id,
-- which stay and are still written until the wizard lands, so this can reach
-- production before the code does.

-- So a row here can point at an activity of its own course only.
alter table activities add constraint activities_id_course_key unique (id, course_id);

create table activity_materials (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  course_id   uuid not null,
  content_id  uuid,
  guide_id    uuid,
  position    int not null check (position >= 0),
  created_at  timestamptz not null default now(),
  -- Exactly one: a reading or an AI-only note.
  check ((content_id is null) <> (guide_id is null)),
  foreign key (activity_id, course_id) references activities (id, course_id) on delete cascade,
  foreign key (content_id, course_id) references course_content (id, course_id),
  foreign key (guide_id, course_id) references course_guides (id, course_id)
);

-- A NULL in a UNIQUE key constrains nothing (CLAUDE.md), so each kind gets a
-- partial unique index over its own NOT NULL column.
create unique index activity_materials_content_key
  on activity_materials (activity_id, content_id) where content_id is not null;
create unique index activity_materials_guide_key
  on activity_materials (activity_id, guide_id) where guide_id is not null;
create index activity_materials_activity_idx on activity_materials (activity_id, position);

alter table activity_materials enable row level security;

-- What activities already point at: the reading first, then the note.
insert into activity_materials (activity_id, course_id, content_id, position)
  select id, course_id, content_id, 0 from activities where content_id is not null;
insert into activity_materials (activity_id, course_id, guide_id, position)
  select id, course_id, guide_id, 1 from activities where guide_id is not null;
