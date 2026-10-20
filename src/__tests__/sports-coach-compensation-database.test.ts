import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { Prisma } from "../../generated/course-client";
import { captureSportsCoachCompensation, moveSportsCoachCompensation } from "@/server/services/sports-coach-compensation";
import { capturedTeacherFee } from "@/server/services/course-captured-teacher-fee";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE "CourseCompensation" ("storeId" text,"templateId" text,"staffId" text,rules jsonb,revision integer,PRIMARY KEY("storeId","templateId","staffId"));
    CREATE TABLE "CourseCompensationSnapshot" ("sessionId" text PRIMARY KEY,"storeId" text,"staffId" text,rule jsonb,revision integer,"durationMinutes" integer,"musicPricePerLesson" integer,"musicTeacherFeeBase" integer,"musicTrialMode" text);
    CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text);
    CREATE TABLE "CourseTemplate" (id text,"storeId" text,"musicPricePerLesson" integer,"musicTeacherFeeBase" integer,"musicTrialMode" text,"musicTeacherShare" float8,"musicSubjectId" text);
    CREATE TABLE "Staff" (id text,"storeId" text,"courseDefaultClassFee" numeric);
    CREATE TABLE "CourseTeacherCompensationSetting" ("storeId" text,"staffId" text,"defaultRatio" numeric,"subjectRules" jsonb,revision integer);
    CREATE TABLE "CourseSession" (id text PRIMARY KEY,"storeId" text,"templateId" text,"coachId" text,"startsAt" timestamptz,"endsAt" timestamptz);`);
  const migration=readFileSync(new URL("../../prisma/migrations/20260929140000_course_staff_person_link/migration.sql",import.meta.url),"utf8");
  await db.exec(migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION course_capture_compensation"),migration.indexOf("REVOKE ALL ON FUNCTION")));
  await db.exec(`CREATE TRIGGER capture_compensation AFTER INSERT OR UPDATE ON "CourseSession" FOR EACH ROW EXECUTE FUNCTION course_capture_compensation();`);
}, 30000);
afterAll(async () => db.close(), 30000);
beforeEach(async () => {
  await db.exec(`TRUNCATE "CourseCompensation","CourseCompensationSnapshot","CourseSession";`);
  await setFee("", "SHARE", 60);
});
async function setFee(staff: string, mode: string | null, value: number, store = "store", template = "item") {
  await db.query(`INSERT INTO "CourseCompensation" VALUES ($1,$2,$3,$4,1) ON CONFLICT ("storeId","templateId","staffId") DO UPDATE SET rules=EXCLUDED.rules,revision="CourseCompensation".revision+1`, [store, template, staff, JSON.stringify(mode ? [{ mode, value }] : [])]);
}
async function snapshot(id = "session") {
  return (await db.query<{ rule: Prisma.JsonValue; revision: number; staffId: string; durationMinutes: number; storeId: string }>(`SELECT * FROM "CourseCompensationSnapshot" WHERE "sessionId"=$1`, [id])).rows[0];
}
const tx = {
  courseCompensation: { findUnique: async ({ where }: { where: { storeId_templateId_staffId: { storeId: string; templateId: string; staffId: string } } }) => {
    const k = where.storeId_templateId_staffId;
    return (await db.query(`SELECT * FROM "CourseCompensation" WHERE "storeId"=$1 AND "templateId"=$2 AND "staffId"=$3`, [k.storeId, k.templateId, k.staffId])).rows[0] ?? null;
  } },
  courseCompensationSnapshot: {
    findUnique: async ({ where }: { where: { sessionId: string } }) => await snapshot(where.sessionId) ?? null,
    upsert: async ({ create }: { create: { sessionId: string; storeId: string; staffId: string; rule: unknown; revision: number; durationMinutes: number } }) => {
      await db.query(`INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes"`, [create.sessionId, create.storeId, create.staffId, JSON.stringify(create.rule), create.revision, create.durationMinutes]);
    },
    update: async ({ where, data }: { where: { sessionId: string }; data: { rule: unknown; durationMinutes: number } }) => {
      await db.query(`UPDATE "CourseCompensationSnapshot" SET rule=$2,"durationMinutes"=$3 WHERE "sessionId"=$1`, [where.sessionId, JSON.stringify(data.rule), data.durationMinutes]);
    },
  },
} as unknown as Prisma.TransactionClient;
const session = { id: "session", templateId: "item", coachId: "coachA", startsAt: new Date("2026-11-01T01:00Z"), endsAt: new Date("2026-11-01T02:30Z") };
const seat = { id: "b", customerName: "合成學員", status: "ATTENDED", bookingKind: "STANDARD", absenceKind: null, originalUnitPrice: 100, sportsCharge: 200 };

it("不同教練在同一項目分別沿用、拆帳、鐘點，保存權威快照並可結算", async () => {
  await setFee("coachB", "SHARE", 70); await setFee("coachC", "HOUR", 800);
  for (const [coachId, expected] of [["coachA", 120], ["coachB", 140], ["coachC", 1200]] as const) {
    await captureSportsCoachCompensation(tx, "store", { ...session, id: coachId, coachId });
    expect(capturedTeacherFee(await snapshot(coachId), [seat]).amount).toBe(expected);
  }
});
it("變更共用／個別費率不回算舊課，清除個別設定只讓新課恢復沿用", async () => {
  await setFee("coachA", "HOUR", 800);
  await captureSportsCoachCompensation(tx, "store", session);
  const original = await snapshot();
  await setFee("coachA", null, 0); await setFee("", "SHARE", 65);
  await captureSportsCoachCompensation(tx, "store", { ...session, id: "new" });
  expect(await snapshot()).toEqual(original);
  expect((await snapshot("new")).rule).toMatchObject({ mode: "SHARE", value: 65, source: "SPORTS_FEE" });
});
it("只調整同一教練時長保留原費率；換教練則改採新教練費率", async () => {
  await setFee("coachA", "HOUR", 600); await setFee("coachB", "HOUR", 800);
  await captureSportsCoachCompensation(tx, "store", session);
  await setFee("coachA", "HOUR", 999);
  await moveSportsCoachCompensation(tx, "store", { ...session, endsAt: new Date("2026-11-01T03:00Z") }, "coachA");
  expect((await snapshot()).rule).toMatchObject({ value: 600, durationMinutes: 120 });
  await moveSportsCoachCompensation(tx, "store", { ...session, coachId: "coachB" }, "coachA");
  expect(await snapshot()).toMatchObject({ staffId: "coachB", rule: { mode: "HOUR", value: 800, durationMinutes: 90 } });
});
it("別店或別項目的同名教練費率不會誤用，零元仍是明確設定", async () => {
  await setFee("coachA", "HOUR", 900, "other"); await setFee("coachA", "HOUR", 777, "store", "otherItem");
  await captureSportsCoachCompensation(tx, "store", session);
  expect((await snapshot()).rule).toMatchObject({ mode: "SHARE", value: 60 });
  await setFee("coachA", "HOUR", 0);
  await captureSportsCoachCompensation(tx, "store", { ...session, id: "zero" });
  expect(capturedTeacherFee(await snapshot("zero"), [seat]).amount).toBe(0);
});
it("新教練沒有可用費率時拒絕換教練，不殘留原教練費率", async () => {
  await captureSportsCoachCompensation(tx, "store", session);
  const original = await snapshot();
  await db.exec(`DELETE FROM "CourseCompensation";`);
  await expect(moveSportsCoachCompensation(tx, "store", { ...session, coachId: "coachB" }, "coachA")).rejects.toThrow("待核對");
  expect(await snapshot()).toEqual(original);
});

it("同一教練換教學項目時核對新項目的個別費率",async()=>{
 await captureSportsCoachCompensation(tx,"store",session);
 await setFee("coachA","HOUR",900,"store","otherItem");
 await moveSportsCoachCompensation(tx,"store",{...session,templateId:"otherItem"},"coachA","item");
 expect((await snapshot()).rule).toMatchObject({mode:"HOUR",value:900,source:"SPORTS_COACH_FEE"});
});

it("真實課次觸發器先執行，再保存運動鐘點快照，避免換教練被覆蓋成 UNSET",async()=>{
 await setFee("coachB","HOUR",800);
 await db.query(`INSERT INTO "CourseSession" VALUES ($1,$2,$3,$4,$5,$6)`,[session.id,"store",session.templateId,session.coachId,session.startsAt,session.endsAt]);
 await captureSportsCoachCompensation(tx,"store",session);
 await db.query(`UPDATE "CourseSession" SET "coachId"='coachB' WHERE id=$1`,[session.id]);
 expect((await snapshot()).rule).toEqual({mode:"UNSET"});
 await moveSportsCoachCompensation(tx,"store",{...session,coachId:"coachB"},"coachA");
 expect((await snapshot()).rule).toMatchObject({mode:"HOUR",value:800,calculationVersion:3});
 expect(capturedTeacherFee(await snapshot(),[seat]).amount).toBe(1200);
});
