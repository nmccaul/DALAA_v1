-- How soon a report needs fixing (D-042): Urgent (p0), Soon (p1), Can wait
-- (p2). The reporter picks it when sending; an admin can change it. NULL for
-- reports sent before it existed, until someone triages them.
alter table feedback_reports add column priority text check (priority in ('p0', 'p1', 'p2'));
