-- Client-generated, so a retried "create" (a double click, a dropped
-- response) returns the first activity instead of making a second one and
-- paying for a second AI draft. Existing rows get a random key; NOT NULL so
-- the unique key always constrains.
alter table activities
  add column creation_key uuid not null default gen_random_uuid(),
  add constraint activities_creation_key_unique unique (creation_key);
