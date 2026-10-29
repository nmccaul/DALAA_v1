-- When an activity is due. NULL means no due date, which is a real choice
-- (practice, ungraded), not a missing value.
alter table activities add column due_at timestamptz;
