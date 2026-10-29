-- One account per email in an institution (D-024). LTI launches, roster sync
-- and signup link to an existing account by email; two accounts sharing one
-- would make that link a guess. Compared lowercase so 'A@x.edu' and 'a@x.edu'
-- are the same person. Users with no email are unconstrained on purpose:
-- rosters create students long before we learn their email.
create unique index users_institution_email_key
  on users (institution_id, lower(email))
  where email is not null;
