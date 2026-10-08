import {readFileSync,readdirSync} from "node:fs";
import {expect,it} from "vitest";
const schema=readFileSync("course-prisma/schema.prisma","utf8");
const draft=readFileSync("docs/sql/music-opening-state-draft-20261007.sql","utf8");
it("keeps a durable native-default discriminator and independent opening representation",()=>{
  expect(schema).toMatch(/musicOpeningStateRequired Boolean @default\(false\)/);
  expect(schema).toContain("model CourseMusicOpeningState");
  expect(schema).toContain('teacherFeePolicy String @default("UNVERIFIED")');
});
it("draft SQL is not registered with migrations or the build runner",()=>{
  expect(readdirSync("prisma/migrations").some(name=>name.includes("music_opening"))).toBe(false);
  expect(readFileSync("scripts/ci-migrate.mjs","utf8")).not.toContain("music-opening-state-draft");
  const executable=draft.replace(/--[^\n]*/g,"");
  expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM|"Course)/i);
});
it("namespaces lesson identity by enrollment and enforces complete non-null fields",()=>{
  expect(draft).toContain('ON "CourseBooking"("storeId","cardId","musicOpeningSourceLessonKey")');
  expect(draft).toContain('ON "CourseBooking"("storeId","cardId","musicOpeningTermKey","musicOpeningLessonOrdinal")');
  expect(draft).toContain('"musicOpeningLessonOrdinal" IS NOT NULL');
  expect(draft).toContain('"cardId" IS NOT NULL AND "customerId" IS NOT NULL');
});
it("proposes same-store foreign keys, RLS and no public API grant",()=>{
  expect(draft).toContain('REFERENCES "CoursePointCard"(id,"storeId")');
  expect(draft).toContain('REFERENCES "Customer"(id,"storeId")');
  expect(draft).toContain('REFERENCES "CourseCardMember"("cardId","customerId")');
  expect(draft).toContain('ENABLE ROW LEVEL SECURITY');
  expect(draft).toContain('REVOKE ALL ON "CourseMusicOpeningState" FROM PUBLIC, anon, authenticated');
});
it("roster renders explicit ordinals and excludes closed prefix from placeholders",()=>{
  const ui=readFileSync("src/app/(dashboard)/dashboard/courses/roster.tsx","utf8");
  expect(ui.match(/lesson.ordinal \?\? \(booking.openingImported/g)).toHaveLength(2);
  expect(ui.match(/remainingTermOrdinals\(booking\).map/g)).toHaveLength(2);
  expect(ui).toContain("if (booking.openingImported) return [];");
  expect(ui).not.toContain("booking.termCount - booking.termLessons.length");
  expect(ui).toContain("切點前已處理");expect(ui).toContain("期初已收");expect(ui).toContain("非本期收款");
});
