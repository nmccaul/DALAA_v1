-- When this course's roster last matched Canvas (null: never synced, or a
-- hand-made course). Shown to the teacher next to "Sync with Canvas".
alter table courses add column canvas_synced_at timestamptz;
