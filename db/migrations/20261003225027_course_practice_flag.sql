-- Courses brought in from practice Canvas (D-019) are marked, stored as a
-- value rather than inferred from ids, so the UI can always label them.
-- Their Canvas ids are namespaced per teacher ("practice:<user>:<id>") so two
-- teachers trying practice Canvas never collide on the unique Canvas ids.
alter table courses add column is_practice boolean not null default false;
