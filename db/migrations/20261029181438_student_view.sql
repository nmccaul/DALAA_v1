-- Canvas's Student View makes a hidden test student each time it's reset; it
-- reaches DALAA through LTI launches and class-list sync (T33). Canvas marks it
-- with the role http://purl.imsglobal.org/vocab/lti/system/person#TestUser.
-- true = Canvas says this member is its Student View user; false = Canvas says
-- it isn't; NULL = never told (REST imports, hand-made rosters). Teachers'
-- lists hide only true. Never used to delete anyone.
alter table course_members add column student_view boolean;
