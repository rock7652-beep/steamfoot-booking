import {readFileSync} from 'node:fs';
// SQL-only capabilities absent from Prisma datamodels. Called exclusively by
// fresh-container setup after the actual database identity has been verified.
export function isolatedDevelopmentSql() {
 const read=file=>readFileSync(file,'utf8');
 const extract=(file,pattern)=>{const value=read(file).match(pattern)?.[0];if(!value)throw new Error('Required development schema definition missing.');return value;};
 return [
  read('supabase/migrations/20261002093141_course_coach_notifications.sql'),
  read('prisma/migrations/20260929044152_music_teacher_finance_scope/migration.sql'),
  read('docs/sql/music-source-import-preview.sql'),
  read('prisma/migrations/20260929042028_music_teacher_compensation_inheritance/migration.sql').split('CREATE OR REPLACE FUNCTION')[0],
  extract('prisma/migrations/20260929140000_course_staff_person_link/migration.sql',/CREATE OR REPLACE FUNCTION course_capture_compensation\(\)[\s\S]*?END \$\$;/),
  extract('prisma/migrations/20260920160000_course_compensation/migration.sql',/CREATE TRIGGER course_capture_compensation[^;]+;/),
  extract('prisma/migrations/20260915140000_course_points_booking/migration.sql',/CREATE UNIQUE INDEX "CourseBooking_active_learner"[^;]+;/),
  extract('prisma/migrations/20261003105340_course_companion_booking/migration.sql',/ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK \([\s\S]*?\n\);/),
  `ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
    status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW') AND (
    ("bookingKind"='CARD' AND "cardId" IS NOT NULL AND "pointCost">0 AND "trialPrice" IS NULL) OR
    ("bookingKind"='TRIAL' AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" BETWEEN 0 AND 1000000) OR
    ("bookingKind" IN ('TEACHER_MAKEUP','OPENING_MAKEUP','UNPAID') AND "cardId" IS NULL AND "pointCost"=0 AND "trialPrice" IS NULL)))`,
 ].join('\n');
}
