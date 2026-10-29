-- An activity a teacher sets up in a course with one of the tools (Study Chat
-- first). Each tool has its own settings shape (CLAUDE.md), checked by that
-- tool's schema in code (src/tools/<tool>/schema.ts); the database only
-- insists it's a JSON object.
create table activities (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null references courses(id) on delete cascade,
  tool                 text not null check (tool ~ '^[a-z][a-z0-9-]*$'),   -- 'study-chat'
  title                text not null check (title <> ''),
  settings             jsonb not null check (jsonb_typeof(settings) = 'object'),
  status               text not null default 'draft' check (status in ('draft', 'published')),
  -- What it's worth in the gradebook. A draft may not have it yet; a
  -- published activity must.
  points               numeric(8, 2) check (points > 0),
  -- Where its grades go in Canvas (LTI Assignment and Grade Services) and the
  -- Canvas link that opens it. NULL until it's added to a Canvas course.
  lti_line_item_url    text check (lti_line_item_url <> ''),
  lti_resource_link_id text check (lti_resource_link_id <> ''),
  created_by           uuid not null references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (status = 'draft' or points is not null),
  -- One activity per Canvas link in a course. NULLs (not linked yet) are
  -- deliberately unconstrained.
  unique (course_id, lti_resource_link_id)
);

create index activities_course_idx on activities (course_id, created_at);

alter table activities enable row level security;
