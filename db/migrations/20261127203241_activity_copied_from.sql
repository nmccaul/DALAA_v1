-- The activity a copy was made from, so *From my other courses* can say
-- "Copied <date>" on a row already copied into this course (feedback
-- f7026325). NULL for an activity that wasn't copied, or whose original was
-- deleted.
alter table activities
  add column copied_from uuid references activities(id) on delete set null;

create index activities_copied_from_idx on activities (copied_from) where copied_from is not null;
