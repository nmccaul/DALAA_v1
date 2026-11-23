-- When a teacher last edited a material's name or text on its page (feedback
-- 8697eb90). NULL until the first edit; the Materials list shows this, or when
-- it was added.
alter table course_content add column updated_at timestamptz;
alter table course_guides add column updated_at timestamptz;
