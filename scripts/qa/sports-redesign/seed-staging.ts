import { PrismaClient } from "@prisma/client";
import { PrismaClient as CourseClient } from "../../../generated/course-client";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hashSync } from "bcryptjs";
import { addTaiwanDuration, toLocalDateStr } from "../../../src/lib/date-utils";
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url)
  throw Error("Dedicated disposable database required");
const db = new PrismaClient({ datasourceUrl: url }),
  course = new CourseClient({ datasourceUrl: url });
async function main() {
  try {
    execFileSync(
      "node_modules/.bin/prisma",
      ["db", "execute", "--url", url, "--stdin"],
      {
        input: readFileSync("scripts/qa/sports-redesign/schema.sql"),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const storeId = "sports-live-flow-store",
      staffId = "sports-live-flow-staff";
    await db.shopConfig.update({
      where: { storeId },
      data: { bookableUntilDate: new Date("2099-12-31"), trialEnabled: true },
    });
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++)
      await db.businessHours.upsert({
        where: { storeId_dayOfWeek: { storeId, dayOfWeek } },
        create: {
          storeId,
          dayOfWeek,
          isOpen: true,
          openTime: "08:00",
          closeTime: "23:00",
        },
        update: { isOpen: true, openTime: "08:00", closeTime: "23:00" },
      });
    await course.musicSubject.upsert({
      where: { id: "sports-staging-yoga" },
      create: {
        id: "sports-staging-yoga",
        storeId,
        name: "瑜珈",
        category: "身心平衡",
      },
      update: {},
    });
    await course.courseTemplate.update({
      where: { id: "sports-live-template" },
      data: { musicSubjectId: "sports-staging-yoga", classType: "GROUP" },
    });
    await course.coursePointPlan.update({
      where: { id: "sports-live-plan" },
      data: { templateIds: ["sports-live-template"] },
    });
    await course.courseRoom.update({
      where: { id: "sports-live-room" },
      data: { rentalEnabled: true, rentalHourlyRate: 1000 },
    });
    for (const [id, name, phone] of [
      ["sports-live-customer", "運動驗收學員", "0900000101"],
      ["sports-live-trial-customer", "體驗驗收學員", "0900000102"],
    ]) {
      const userId = id + "-user";
      await db.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          name,
          email: id + "@example.invalid",
          role: "CUSTOMER",
          passwordHash: hashSync("isolated-sports-test-only", 10),
        },
        update: {},
      });
      await db.customer.update({ where: { id }, data: { userId, phone } });
      await db.customerIdentityLink.upsert({
        where: {
          uq_customer_identity_customer_provider: {
            customerId: id,
            provider: "credentials",
          },
        },
        create: {
          userId,
          storeId,
          customerId: id,
          provider: "credentials",
          providerAccountId: userId,
        },
        update: {},
      });
    }
    console.log(
      JSON.stringify({
        seeded: true,
        storeId,
        date: toLocalDateStr(),
        nextDay: addTaiwanDuration(toLocalDateStr(), 1, "DAY"),
        staffId,
      }),
    );
  } finally {
    await db.$disconnect();
    await course.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
