-- Additive course-only metadata; preserves all existing schedules and RLS.
ALTER TABLE public."CourseRoom" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE public."CourseTemplate" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE public."CourseRoom" ADD CONSTRAINT "CourseRoom_category_length" CHECK (char_length("category") <= 40);
ALTER TABLE public."CourseTemplate" ADD CONSTRAINT "CourseTemplate_category_length" CHECK (char_length("category") <= 40);
