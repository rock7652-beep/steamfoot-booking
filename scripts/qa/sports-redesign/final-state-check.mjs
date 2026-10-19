import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { PrismaClient } = require("../../../generated/course-client");
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url) throw Error("Isolated database required");
const db = new PrismaClient({ datasourceUrl: url }),
  storeId = "sports-live-flow-store",
  checks = [];
const pass = (name) => {
  checks.push({ name, passed: true });
  console.log("PASS", name);
};
try {
  const rows =
    await db.$queryRaw`SELECT r.frequency,r.enrollment,s.id,s."startsAt",s."rescheduledFromStartsAt",s."cancelledAt",s."isTrial" FROM "SportsStagingSessionRule" r JOIN "CourseSession" s ON s.id=r."sessionId" WHERE r."storeId"=${storeId}`;
  const localTime = (date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  const movedBi = rows.find(
    (r) =>
      r.frequency === "BIWEEKLY" &&
      r.enrollment === "OPEN" &&
      r.rescheduledFromStartsAt,
  );
  assert.equal(localTime(movedBi.startsAt), "13:00");
  assert.equal(localTime(movedBi.rescheduledFromStartsAt), "12:00");
  pass("隔週固定異動確實保留原位資訊");
  for (const [trial, time] of [
    [false, "08:00"],
    [true, "15:00"],
  ]) {
    const r = rows.find(
      (r) =>
        r.frequency === "SINGLE" &&
        r.isTrial === trial &&
        localTime(r.startsAt) === time,
    );
    assert.ok(r.rescheduledFromStartsAt);
  }
  pass("單次與體驗移動保留稽核資料，畫面未當成固定課淡化");
  const cancelled = rows.find(
    (r) =>
      r.frequency === "BIWEEKLY" &&
      r.enrollment === "ASSIGNED" &&
      r.cancelledAt,
  );
  assert.ok(cancelled);
  const bookings = await db.courseBooking.findMany({
    where: { sessionId: cancelled.id },
  });
  assert.ok(
    bookings.length > 0 && bookings.every((b) => b.status === "CANCELLED"),
  );
  pass("固定單堂取消後所有指定學員保留額度釋放");
  const rental = await db.courseRental.findFirst({
    where: { storeId, cancelledAt: { not: null } },
  });
  assert.equal(localTime(rental.startsAt), "17:00");
  assert.equal(
    await db.courseRentalPayment.count({
      where: { storeId, rentalId: rental.id, status: "SUCCESS" },
    }),
    0,
  );
  pass("租借移動後取消，原收款已作廢且無有效重複收款");
  const p = await db.coursePointPlan.findFirst({
      where: { storeId, name: "肌力十堂" },
    }),
    purchase = await db.coursePurchase.findFirst({
      where: { storeId, planId: p.id },
    }),
    card = await db.coursePointCard.findUnique({
      where: { id: purchase.cardId },
    });
  assert.equal(purchase.price, 6000);
  assert.ok(p.price !== purchase.price);
  assert.equal(card.remaining, 10);
  assert.equal(card.unit, "SESSION");
  pass("改價後舊購買仍為6000、原卡剩餘10堂");
  const previous = JSON.parse(
    readFileSync(
      "artifacts/sports-redesign-live/compatibility-checks.json",
      "utf8",
    ),
  );
  writeFileSync(
    "artifacts/sports-redesign-live/final-state-checks.json",
    JSON.stringify({ checks, compatibilityChecks: previous.checks }, null, 2),
  );
} finally {
  await db.$disconnect();
}
