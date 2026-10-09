import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
import { calculateMarketingUsage } from "@/lib/marketing-usage-server";

// No Prisma client, network, real records, or notification producer is used. The
// actual tagged SQL is executed by PostgreSQL in memory, not reproduced in tests.
// This small fixture does not need PGlite's larger default memory allocation.
const db = new PGlite({ initialMemory: 128 * 1024 * 1024 });
const now = new Date("2026-10-03T04:00:00.000Z");
const sentBeforeCutoff = "2026-10-02T15:59:59.999Z";
const cutoff = "2026-10-02T16:00:00.000Z";
const tables = ["Store", "Customer", "Booking", "CourseSession", "CourseBooking", "SpaBooking", "ReminderRule", "MessageLog", "SessionBalanceNotification", "ManagerNotificationLog"] as const;
type Table = typeof tables[number];
type Fixture = Record<string, string | number | boolean | null>;

async function insert(table: Table, row: Fixture) {
  const columns = Object.keys(row);
  await db.query(
    `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    Object.values(row),
  );
}
const store = (id = "s1", overrides: Fixture = {}) => insert("Store", { id, name: "正常門市", slug: id, ...overrides });
const customer = (id = "c1", storeId = "s1", overrides: Fixture = {}) => insert("Customer", { id, storeId, name: "一般顧客", ...overrides });
const booking = (id = "b1", overrides: Fixture = {}) => insert("Booking", { id, storeId: "s1", customerId: "c1", ...overrides });
const courseSession = (id = "session1", overrides: Fixture = {}) => insert("CourseSession", { id, storeId: "s1", ...overrides });
const courseBooking = (id = "cb1", overrides: Fixture = {}) => insert("CourseBooking", { id, storeId: "s1", customerId: "c1", sessionId: "session1", ...overrides });
const spaBooking = (id = "spa1", overrides: Fixture = {}) => insert("SpaBooking", { id, storeId: "s1", customerId: "c1", ...overrides });
const rule = (id = "r1", overrides: Fixture = {}) => insert("ReminderRule", { id, storeId: "s1", triggerType: "CUSTOM", ...overrides });
const message = (id: string, overrides: Fixture = {}) => insert("MessageLog", { id, storeId: "s1", customerId: "c1", ...overrides });
const notification = (id: string, overrides: Fixture = {}) => insert("SessionBalanceNotification", { id, storeId: "s1", customerId: "c1", walletId: "w1", type: "LAST_SESSION", ...overrides });
const scheduled = (id: string, overrides: Fixture = {}) => message(id, { ruleId: "r1", bookingId: "b1", triggerAt: "2026-10-02T10:00:00.000Z", ...overrides });
const aggregate = () => calculateMarketingUsage(now);

beforeAll(async () => {
  // Preserve Prisma's date/timestamp distinctions. Constraints unrelated to the
  // read are omitted so legacy duplicate and malformed cross-store rows can be tested.
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE TABLE "Store" (
      id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL,
      "isDemo" boolean NOT NULL DEFAULT false, "archivedAt" timestamp(3),
      "operatingStatus" text NOT NULL DEFAULT 'ACTIVE', plan text NOT NULL DEFAULT 'PRO',
      "planStatus" text NOT NULL DEFAULT 'ACTIVE', "planEffectiveAt" timestamp(3), "planExpiresAt" timestamp(3)
    );
    CREATE TABLE "Customer" (id text PRIMARY KEY, "storeId" text NOT NULL, name text NOT NULL, "centralMemberId" text);
    CREATE TABLE "Booking" (
      id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL,
      "bookingStatus" text NOT NULL DEFAULT 'COMPLETED', "bookingDate" date NOT NULL DEFAULT '2026-10-02',
      people integer NOT NULL DEFAULT 1, "attendedPeople" integer, notes text
    );
    CREATE TABLE "CourseSession" (
      id text PRIMARY KEY, "storeId" text NOT NULL,
      "endsAt" timestamptz(3) NOT NULL DEFAULT '2026-10-02T15:59:59.999Z', "cancelledAt" timestamptz(3)
    );
    CREATE TABLE "CourseBooking" (
      id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text, "sessionId" text NOT NULL,
      status text NOT NULL DEFAULT 'ATTENDED', notes text
    );
    CREATE TABLE "SpaBooking" (
      id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL,
      status text NOT NULL DEFAULT 'COMPLETED', "bookingDate" date NOT NULL DEFAULT '2026-10-02',
      people integer NOT NULL DEFAULT 1, notes text
    );
    CREATE TABLE "ReminderRule" (id text PRIMARY KEY, "storeId" text NOT NULL, "triggerType" text NOT NULL);
    CREATE TABLE "MessageLog" (
      id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL, "ruleId" text,
      "bookingId" text, "courseBookingId" text, "courseCardId" text, "triggerAt" timestamp(3),
      status text NOT NULL DEFAULT 'SENT', "sentAt" timestamp(3) DEFAULT '2026-10-02T15:59:59.999Z',
      "createdAt" timestamp(3) DEFAULT '2026-10-01', "renderedBody" text
    );
    CREATE TABLE "SessionBalanceNotification" (
      id text PRIMARY KEY, "storeId" text NOT NULL, "customerId" text NOT NULL, "walletId" text NOT NULL,
      type text NOT NULL, status text NOT NULL DEFAULT 'SENT',
      "sentAt" timestamp(3) DEFAULT '2026-10-02T15:59:59.999Z', "deliveryAttempts" integer DEFAULT 1,
      "managerNotificationStatus" text, "managerNotifiedAt" timestamp(3)
    );
    CREATE TABLE "ManagerNotificationLog" (
      id text PRIMARY KEY, "storeId" text NOT NULL, status text NOT NULL, "sentAt" timestamp(3)
    );
  `);
  mocks.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return (await db.query(sql, values.map(value => value instanceof Date ? value.toISOString() : value))).rows;
  });
}, 30_000);

afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`TRUNCATE ${tables.map(table => `"${table}"`).join(",")}`);
  mocks.query.mockClear();
});

describe("marketing usage aggregate SQL in isolated PostgreSQL", () => {
  it("returns one zero-valued aggregate for an empty database", async () => {
    expect(await aggregate()).toEqual({ stores: 0, customers: 0, completedPeople: 0, remindersSent: 0, asOf: "2026-10-02" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("applies eligible active/trial store rules to every metric", async () => {
    const experience = { plan: "EXPERIENCE", planStatus: "TRIAL", planEffectiveAt: "2026-10-01", planExpiresAt: "2026-10-31" };
    const eligible: Fixture[] = [
      {},
      { ...experience, operatingStatus: "TRIAL" },
      { ...experience, operatingStatus: "ACTIVE", planEffectiveAt: "2026-10-03", planExpiresAt: "2026-10-03" },
      { slug: "latest-branch" }, // Slug exclusions match segments, not substrings.
    ];
    const excluded: Fixture[] = [
      { ...experience, planExpiresAt: "2026-10-02" },
      { ...experience, planEffectiveAt: null },
      { ...experience, planEffectiveAt: "2026-10-04" },
      { ...experience, planExpiresAt: null },
      { ...experience, planStatus: "EXPIRED" },
      { ...experience, operatingStatus: "SUSPENDED" },
      { operatingStatus: "TRIAL" }, // Paid-plan TRIAL is not an activated experience.
      { operatingStatus: "SUSPENDED" },
      { isDemo: true },
      { archivedAt: "2026-10-01" },
      ...["測試門市", "驗收門市", "TeSt branch", "DEMO branch"].map(name => ({ name })),
      ...["test", "branch-test-east", "demo-branch", "branch-QA", "qa"].map(slug => ({ slug })),
    ];
    for (const [index, overrides] of [...eligible, ...excluded].entries()) {
      const storeId = `branch-${index}`, customerId = `person-${index}`;
      await store(storeId, overrides);
      await customer(customerId, storeId);
      await booking(`booking-${index}`, { storeId, customerId, people: 2 });
      await message(`plan-expiry-7-days:${index}`, { storeId, customerId });
      await notification(`balance-${index}`, { storeId, customerId, walletId: `wallet-${index}` });
    }
    expect(await aggregate()).toEqual({ stores: 4, customers: 4, completedPeople: 8, remindersSent: 8, asOf: "2026-10-02" });
  });

  it("preserves served-customer de-duplication per store and completed-person semantics across modules", async () => {
    await store(); await store("s2");
    await customer("c1", "s1", { centralMemberId: "same-person" });
    await customer("c2");
    await customer("c3", "s2", { centralMemberId: "same-person" });
    await customer("registered-but-unserved");
    await booking("attended", { people: 5, attendedPeople: 2 });
    await booking("fallback", { people: 3 });
    await booking("zero-attendance", { people: 8, attendedPeople: 0 });
    await booking("other-store", { storeId: "s2", customerId: "c3", people: 6 });
    await courseSession();
    await courseBooking();
    await courseBooking("second-customer", { customerId: "c2" });
    await spaBooking("spa1", { people: 4 });

    for (const status of ["PENDING", "CONFIRMED", "CANCELLED", "NO_SHOW"]) {
      await booking(`steam-${status}`, { bookingStatus: status, people: 100 });
      await spaBooking(`spa-${status}`, { status, people: 100 });
    }
    for (const date of ["2026-10-03", "2026-10-04"]) {
      await booking(`steam-${date}`, { bookingDate: date, people: 100 });
      await spaBooking(`spa-${date}`, { bookingDate: date, people: 100 });
    }
    for (const status of ["RESERVED", "CANCELLED", "NO_SHOW"]) {
      await courseBooking(`course-${status}`, { status });
    }
    await courseSession("cancelled", { cancelledAt: "2026-10-02T12:00:00Z" });
    await courseBooking("cancelled-session", { sessionId: "cancelled" });
    await courseSession("at-cutoff", { endsAt: cutoff });
    await courseBooking("ends-at-cutoff", { sessionId: "at-cutoff" });
    await courseSession("future", { endsAt: "2026-10-03T10:00:00Z" });
    await courseBooking("future-session", { sessionId: "future" });

    // 2 + 3 + 0 steam, 2 course attendees, 4 SPA, and 6 at the second store.
    expect(await aggregate()).toEqual({ stores: 2, customers: 3, completedPeople: 17, remindersSent: 0, asOf: "2026-10-02" });
  });

  it("excludes test customers, acceptance notes, and cross-store customer/session joins", async () => {
    await store(); await store("s2"); await customer(); await customer("foreign", "s2");
    await rule(); await courseSession();
    for (const [index, name] of ["測試顧客", "驗收顧客", "TEST Person", "Demo Person"].entries()) {
      const customerId = `excluded-${index}`;
      await customer(customerId, "s1", { name });
      await booking(`named-${index}`, { customerId });
      await spaBooking(`named-spa-${index}`, { customerId });
      await courseBooking(`named-course-${index}`, { customerId });
      await message(`plan-expiry-7-days:named-${index}`, { customerId });
      await notification(`named-balance-${index}`, { customerId, walletId: customerId });
    }
    for (const [index, notes] of ["驗收", "測試預約", "TEST BOOKING", "Demo"].entries()) {
      const bookingId = `noted-${index}`, courseBookingId = `noted-course-${index}`;
      await booking(bookingId, { notes });
      await spaBooking(`noted-spa-${index}`, { notes });
      await courseBooking(courseBookingId, { notes });
      await scheduled(`noted-message-${index}`, { bookingId });
      await message(`course-reminder:noted-${index}`, { courseBookingId, triggerAt: sentBeforeCutoff });
    }
    for (const customerId of ["foreign", "missing-customer"]) {
      await booking(`bad-customer-${customerId}`, { customerId });
      await spaBooking(`bad-spa-${customerId}`, { customerId });
      await courseBooking(`bad-course-${customerId}`, { customerId });
      await message(`plan-expiry-14-days:${customerId}`, { customerId });
      await notification(`bad-balance-${customerId}`, { customerId, walletId: customerId });
    }
    await courseSession("foreign-session", { storeId: "s2" });
    await courseBooking("wrong-session-store", { sessionId: "foreign-session" });
    await courseBooking("missing-session", { sessionId: "absent-session" });
    expect(await aggregate()).toEqual({ stores: 2, customers: 0, completedPeople: 0, remindersSent: 0, asOf: "2026-10-02" });
  });

  it("counts only SENT deliveries with a non-null sentAt strictly before the cutoff", async () => {
    await store(); await customer();
    await message("plan-expiry-7-days:included", { createdAt: "2026-10-03T10:00:00Z" });
    for (const status of ["PENDING", "FAILED", "SKIPPED"]) {
      await message(`plan-expiry-7-days:${status}`, { status });
    }
    await message("plan-expiry-7-days:no-time", { sentAt: null });
    await message("plan-expiry-7-days:boundary", { sentAt: cutoff });
    await message("plan-expiry-7-days:later", { sentAt: "2026-10-03T01:00:00Z", createdAt: "2026-10-01" });
    expect(await aggregate()).toMatchObject({ customers: 0, completedPeople: 0, remindersSent: 1 });
  });

  it.each([
    ["course-reminder", { courseBookingId: "cb1", triggerAt: sentBeforeCutoff }],
    ["plan-expiry-14-days", {}],
    ["plan-expiry-7-days", {}],
    ["course-expiry", { courseCardId: "card1" }],
    ["course-low-balance", { courseCardId: "card1" }],
    ["course-used-up", { courseCardId: "card1" }],
  ] satisfies [string, Fixture][])("recognizes %s stable delivery IDs", async (prefix, fields) => {
    await store(); await customer(); await courseSession(); await courseBooking();
    await message(`${prefix}:stable-a`, fields);
    // The producer retries by updating the same stable row, not adding a send.
    await db.query('UPDATE "MessageLog" SET status=\'SENT\', "sentAt"=$1 WHERE id=$2', [sentBeforeCutoff, `${prefix}:stable-a`]);
    await message(`${prefix}:stable-b`, fields);
    expect((await aggregate()).remindersSent).toBe(2);
  });

  it("de-duplicates booking retries by scheduled intent while retaining genuinely different intents", async () => {
    await store(); await customer(); await rule(); await booking();
    await scheduled("legacy-attempt-one");
    await scheduled("legacy-attempt-two");
    await scheduled("stable-current-id");
    await scheduled("rescheduled", { triggerAt: "2026-10-02T11:00:00Z" });
    await rule("day-rule", { triggerType: "BEFORE_BOOKING_1D" });
    await scheduled("one-day", { ruleId: "day-rule" });
    await rule("hour-rule", { triggerType: "BEFORE_BOOKING_2H" });
    await scheduled("two-hours", { ruleId: "hour-rule" });
    await booking("b2");
    await scheduled("another-booking", { bookingId: "b2" });
    await store("s2"); await customer("c2", "s2");
    await rule("other-rule", { storeId: "s2" });
    await booking("other-booking", { storeId: "s2", customerId: "c2" });
    await scheduled("other-store", { storeId: "s2", customerId: "c2", ruleId: "other-rule", bookingId: "other-booking" });
    expect((await aggregate()).remindersSent).toBe(6);
  });

  it("rejects manual, smoke-test, marketing, manager, and incomplete legacy messages", async () => {
    await store(); await store("s2"); await customer(); await rule(); await booking();
    await scheduled("automatic-control");
    await message("manual", { bookingId: "b1" });
    await message("test-send", { bookingId: "b1", renderedBody: "【測試提醒｜不影響正式排程】" });
    await scheduled("legacy-without-trigger", { triggerAt: null });
    await scheduled("missing-booking-link", { bookingId: null });
    await scheduled("missing-booking-record", { bookingId: "deleted-booking" });
    await booking("foreign-booking", { storeId: "s2" });
    await scheduled("wrong-booking-store", { bookingId: "foreign-booking" });
    await scheduled("missing-rule", { ruleId: "deleted-rule" });
    await rule("foreign-rule", { storeId: "s2" });
    await scheduled("wrong-rule-store", { ruleId: "foreign-rule" });
    for (const triggerType of ["AFTER_SERVICE_7D", "INACTIVE_30D", "COURSE_NEXT_DAY"]) {
      await rule(triggerType, { triggerType });
      await scheduled(`marketing-${triggerType}`, { ruleId: triggerType });
    }
    await message("course-reminder:no-booking", { triggerAt: sentBeforeCutoff });
    await message("course-reminder:no-trigger", { courseBookingId: "cb1" });
    await message("course-reminder:deleted-booking", { courseBookingId: "deleted-course-booking", triggerAt: sentBeforeCutoff });
    await courseBooking("foreign-course-booking", { storeId: "s2" });
    await message("course-reminder:foreign-booking", { courseBookingId: "foreign-course-booking", triggerAt: sentBeforeCutoff });
    for (const prefix of ["course-expiry", "course-low-balance", "course-used-up"]) {
      await message(`${prefix}:no-card`);
    }
    await message("plan-expiry-30-days:unsupported");
    await message("course-purchase:receipt", { courseCardId: "card1" });
    await insert("ManagerNotificationLog", { id: "manager-only", storeId: "s1", status: "SENT", sentAt: sentBeforeCutoff });
    expect((await aggregate()).remindersSent).toBe(1);
  });

  it("counts wallet/type intents once and never adds manager notices or unsuccessful balance attempts", async () => {
    await store(); await customer();
    await notification("balance-first", { deliveryAttempts: 4, managerNotificationStatus: "SENT", managerNotifiedAt: sentBeforeCutoff });
    await notification("legacy-balance-retry", { deliveryAttempts: 3 });
    await notification("used-up", { type: "PLAN_USED_UP" });
    await notification("second-wallet", { walletId: "w2" });
    for (const status of ["PENDING", "FAILED", "SKIPPED"]) {
      await notification(`balance-${status}`, { walletId: status, status, managerNotificationStatus: "SENT", managerNotifiedAt: sentBeforeCutoff });
    }
    await notification("balance-no-time", { walletId: "no-time", sentAt: null });
    await notification("balance-at-cutoff", { walletId: "boundary", sentAt: cutoff });
    await notification("balance-later", { walletId: "later", sentAt: "2026-10-03T10:00:00Z" });
    await notification("unsupported-type", { walletId: "other", type: "MANAGER_FOLLOWUP" });
    expect((await aggregate()).remindersSent).toBe(3);
  });

  it("retains successful historical reminders when bookings or course sessions are later cancelled", async () => {
    await store(); await customer(); await rule();
    await booking("b1", { bookingStatus: "CANCELLED" });
    await scheduled("sent-before-cancellation");
    await courseSession("session1", { cancelledAt: "2026-10-03T01:00:00Z" });
    await courseBooking("cb1", { status: "CANCELLED" });
    await message("course-reminder:sent-before-cancellation", { courseBookingId: "cb1", triggerAt: sentBeforeCutoff });
    expect(await aggregate()).toEqual({ stores: 1, customers: 0, completedPeople: 0, remindersSent: 2, asOf: "2026-10-02" });
  });

  it("advances date and timestamp cutoffs together exactly at Taipei midnight", async () => {
    await store(); await customer();
    await booking("yesterday", { bookingDate: "2026-10-01" });
    await booking("today", { bookingDate: "2026-10-02" });
    await courseSession("previous-day", { endsAt: "2026-10-01T15:59:59.999Z" });
    await courseBooking("previous-course", { sessionId: "previous-day" });
    await courseSession(); await courseBooking();
    await message("plan-expiry-7-days:previous", { sentAt: "2026-10-01T15:59:59.999Z" });
    await message("plan-expiry-7-days:just-before");
    await message("plan-expiry-7-days:at-midnight", { sentAt: cutoff });
    await notification("balance-previous", { walletId: "previous", sentAt: "2026-10-01T15:59:59.999Z" });
    await notification("balance-before");
    await notification("balance-midnight", { walletId: "midnight", sentAt: cutoff });
    expect(await calculateMarketingUsage(new Date(sentBeforeCutoff))).toEqual({ stores: 1, customers: 1, completedPeople: 2, remindersSent: 2, asOf: "2026-10-01" });
    expect(await calculateMarketingUsage(new Date(cutoff))).toEqual({ stores: 1, customers: 1, completedPeople: 4, remindersSent: 4, asOf: "2026-10-02" });
  });
});
