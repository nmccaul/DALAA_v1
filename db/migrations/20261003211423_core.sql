-- Core chassis tables: who people are, which courses exist, who is in them.
-- Each constraint names the failure it prevents. D-016, D-017, D-018.

-- One row today (BYU). Carried on core tables so v3 multi-institution doesn't
-- need a migration that touches every row (D-018).
create table institutions (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

insert into institutions (slug, name) values ('byu', 'Brigham Young University');

-- external_id is the NetID — never the SSO provider's opaque subject. Rosters
-- create students before they ever sign in; keying on anything else gives every
-- student a second, empty account. Stored lowercase so 'JDoe' and 'jdoe' can't
-- become two people. No password column: sign-in is always BYU's.
create table users (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  external_id    text not null check (external_id <> '' and external_id = lower(external_id)),
  display_name   text not null,
  email          text,
  created_at     timestamptz not null default now(),
  unique (institution_id, external_id)
);

-- Staff accounts come only from this list, never from sign-in alone (D-018).
-- Keyed by NetID so a professor can be invited before their first sign-in.
create table staff_allowlist (
  institution_id uuid not null references institutions(id),
  external_id    text not null check (external_id <> '' and external_id = lower(external_id)),
  is_admin       boolean not null default false,
  added_at       timestamptz not null default now(),
  primary key (institution_id, external_id)
);

-- canvas_course_id is null until the course is linked to Canvas (D-017). Many
-- unlinked courses may coexist, so NULLs being distinct in the UNIQUE is the
-- intended behaviour here, not the Quizzer bug.
create table courses (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id),
  code             text not null check (code <> ''),     -- 'BUS M 361'
  title            text not null check (title <> ''),
  term             text not null check (term <> ''),     -- 'Winter 2027'
  canvas_course_id text,
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  unique (institution_id, canvas_course_id)
);

-- canvas_section_id: unique across courses because cross-listing is real at BYU.
create table sections (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references courses(id) on delete cascade,
  name              text not null check (name <> ''),    -- '002'
  canvas_section_id text unique,
  unique (course_id, name),
  unique (course_id, id)  -- target for the same-course FK below
);

-- One row per person per course. A course may have several instructors and a
-- professor may teach many courses (D-018). A student's section must belong to
-- the same course — enforced by the composite foreign key, not by app code.
-- Roster changes flag; they never delete ('flagged' = no longer on the roster).
create table course_members (
  course_id  uuid not null references courses(id) on delete cascade,
  user_id    uuid not null references users(id),
  role       text not null check (role in ('instructor', 'student')),
  section_id uuid,
  status     text not null default 'active' check (status in ('active', 'flagged')),
  added_at   timestamptz not null default now(),
  primary key (course_id, user_id),
  foreign key (course_id, section_id) references sections (course_id, id)
);

create index course_members_user_idx on course_members (user_id);

-- Supabase exposes the public schema through its REST API. RLS with no
-- policies means that API reads nothing; the app connects as the table owner
-- and is unaffected. Plain Postgres, so it moves with the database (D-007).
-- Every new table gets this line too.
alter table institutions    enable row level security;
alter table users           enable row level security;
alter table staff_allowlist enable row level security;
alter table courses         enable row level security;
alter table sections        enable row level security;
alter table course_members  enable row level security;
