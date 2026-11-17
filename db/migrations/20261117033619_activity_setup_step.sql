-- The setup step a teacher was last on, so a draft reopens there (feedback
-- 391261a8). NULL: never opened in setup; it opens on the first step.
alter table activities add column setup_step text check (setup_step <> '');
