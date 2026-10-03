-- Creating a course is idempotent (CLAUDE.md: every write carries a
-- client-generated id). The form sends a key; a double-click or retry finds
-- the course already made instead of making a second one. NOT NULL with a
-- default, so rows created any other way still get a unique key.
alter table courses
  add column creation_key uuid not null default gen_random_uuid();

alter table courses
  add constraint courses_creation_key_key unique (creation_key);
