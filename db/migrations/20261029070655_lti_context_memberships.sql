-- Where this Canvas course's class list can be read (LTI Names and Role
-- Provisioning Services). Canvas sends it on every launch; the latest launch
-- wins. NULL until a launch carries it, and then "Sync with Canvas" can't run.
alter table lti_contexts add column memberships_url text check (memberships_url <> '');
