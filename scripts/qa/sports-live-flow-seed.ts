/** Creates only a disposable loopback QA store. Never accepts a deployed DB. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaClient as CourseClient } from "../../generated/course-client";
import { hashSync } from "bcryptjs";
import { resolveBookingConcurrencyTestDatabaseUrl } from "../../src/__tests__/helpers/booking-concurrency-test-db";
import { addTaiwanDuration, toLocalDateStr } from "../../src/lib/date-utils";

const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl({ BOOKING_CONCURRENCY_TEST_DATABASE_URL: process.env.DATABASE_URL });
if (!databaseUrl || new URL(databaseUrl).pathname !== "/sports_live_flow_test") throw new Error("Dedicated sports_live_flow_test database required");
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const course = new CourseClient({ datasourceUrl: databaseUrl });
async function main() {
try {
  const tables = await db.$queryRaw<Array<{ present: string | null }>>`SELECT to_regclass('public."CoursePointPlan"')::text AS present`;
  if (!tables[0]?.present) {
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    for (const sql of ddl.split(";").map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(sql);
  }
  const notices = await db.$queryRaw<Array<{ present: string | null }>>`SELECT to_regclass('public."CourseCoachNotification"')::text AS present`;
  if (!notices[0]?.present) {
    const roles = ["anon", "authenticated", "service_role"].map(role => `DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`).join("\n");
    const migration = readFileSync("supabase/migrations/20261002093141_course_coach_notifications.sql", "utf8");
    execFileSync("node_modules/.bin/prisma", ["db", "execute", "--url", databaseUrl!, "--stdin"], { input: roles + "\n" + migration, stdio: ["pipe", "pipe", "pipe"] });
  }
  const storeId = "sports-live-flow-store", userId = "sports-live-flow-owner", staffId = "sports-live-flow-staff";
  await db.store.upsert({ where: { id: storeId }, create: { id: storeId, slug: "sports-live-flow", name: "運動流程隔離驗收店", industryModule: "COURSE", plan: "EXPERIENCE" }, update: {} });
  await db.storeFeatureEntitlement.upsert({ where: { uq_store_feature_entitlement: { storeId, featureKey: "business.fitness" } }, create: { storeId, featureKey: "business.fitness", status: "ENABLED" }, update: {} });
  await db.user.upsert({ where: { id: userId }, create: { id: userId, name: "驗收老闆", email: "sports-owner@example.invalid", role: "OWNER", passwordHash: hashSync("isolated-sports-test-only", 10) }, update: {} });
  await db.staff.upsert({ where: { id: staffId }, create: { id: staffId, userId, storeId, displayName: "驗收老闆", isOwner: true, courseCoachEnabled: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: ["sports-live-template"] }, update: {} });
  for (const [id, name, phone] of [["sports-live-customer", "運動驗收學員", "0900000101"], ["sports-live-trial-customer", "體驗驗收學員", "0900000102"]]) {
    await db.customer.upsert({ where: { id }, create: { id, storeId, name, phone, assignedStaffId: staffId }, update: {} });
  }
  await db.shopConfig.upsert({ where: { storeId }, create: { storeId, trialEnabled: true, trialDefaultPrice: 499, trialAllowPriceEdit: true, trialMinPrice: 0, trialMaxPrice: 1000 }, update: {} });
  await course.courseRoom.upsert({ where: { id: "sports-live-room" }, create: { id: "sports-live-room", storeId, name: "運動驗收空間", capacity: 8 }, update: {} });
  await course.courseTemplate.upsert({ where: { id: "sports-live-template" }, create: { id: "sports-live-template", storeId, name: "運動驗收課程", durationMinutes: 60, capacity: 8, pointCost: 1, defaultRoomId: "sports-live-room" }, update: {} });
  await course.coursePointPlan.upsert({ where: { id: "sports-live-plan" }, create: { id: "sports-live-plan", storeId, name: "運動驗收十點方案", points: 10, price: 1000, validDays: 30, unit: "POINT", storeCost: 0 }, update: {} });
  const tomorrow = addTaiwanDuration(toLocalDateStr(), 1, "DAY");
  await course.courseSession.upsert({ where: { id: "sports-live-session" }, create: { id: "sports-live-session", storeId, templateId: "sports-live-template", roomId: "sports-live-room", coachId: staffId, nameSnapshot: "運動驗收課程", startsAt: new Date(`${tomorrow}T10:00:00+08:00`), endsAt: new Date(`${tomorrow}T11:00:00+08:00`), capacity: 8, pointCost: 1, requestKey: "sports-live-session", requestIndex: 0, createdById: userId }, update: {} });
  await course.courseBooking.upsert({ where: { id: "sports-live-trial" }, create: { id: "sports-live-trial", storeId, sessionId: "sports-live-session", bookingKind: "TRIAL", trialPrice: 499, pointCost: 0, customerId: "sports-live-trial-customer", customerName: "體驗驗收學員", operatorUserId: userId, operatorName: "驗收老闆", requestKey: "sports-live-trial" }, update: {} });
  console.log(JSON.stringify({ store: "sports-live-flow", isolatedDatabase: true, tomorrow, seeded: true }));
} finally { await db.$disconnect(); await course.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Seed failed"); process.exitCode = 1; });
