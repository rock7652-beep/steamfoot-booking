-- Explicit capabilities still required. Null = entire store; [] = no teachers.
CREATE TABLE "CourseTeacherFinanceScope" (
 "storeId" text NOT NULL REFERENCES "Store"(id),
 "staffId" text NOT NULL,
 "teacherIds" text[],
 "updatedAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("storeId","staffId"),
 FOREIGN KEY ("staffId","storeId") REFERENCES "Staff"(id,"storeId")
);
ALTER TABLE "CourseTeacherFinanceScope" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseTeacherFinanceScope" FROM PUBLIC,anon,authenticated;
