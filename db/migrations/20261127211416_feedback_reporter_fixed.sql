-- When the person who sent a report said "I think this is fixed" on the Help
-- tab (feedback 2e7b873b). Only a hint for the admin, who still resolves it:
-- the report stays open. NULL: they haven't said so. Kept off feedback_fixes,
-- whose statuses are the bug loop's.
alter table feedback_reports
  add column reporter_fixed_at timestamptz;
