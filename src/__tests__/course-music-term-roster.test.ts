import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  bookings: vi.fn(),
  absences: vi.fn(),
  leaveCounts: vi.fn(),
  customers: vi.fn(),
  purchases: vi.fn(),
  cards: vi.fn(),
  sessionCount: vi.fn(),
}));
vi.mock("@/lib/course-db", () => ({
  coursePrisma: {
    courseBooking: { findMany: (query: { where: { sessionId?: string } }) => query.where.sessionId ? db.bookings(query) : db.absences(query), groupBy: db.leaveCounts },
    courseSession: { count: db.sessionCount },
    coursePurchase: { findMany: db.purchases },
    coursePointCard: { findMany: db.cards },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: db.customers } } }));
import { getCourseRoster } from "@/server/queries/course-members";

const day = (n: number) => new Date(`2026-09-${String(n).padStart(2, "0")}T10:00:00.000Z`);
const lesson = (student: string, index: number, status = "ATTENDED", absenceKind: string | null = null) => ({
  id: `${student}-${index}`, customerId: student, sessionId: `session-${index}`, pointCost: 1,
  status, absenceKind, session: { startsAt: day(1 + index * 7), templateId: "guitar" },
});
const card = (student: string, lessons: ReturnType<typeof lesson>[], points: number, createdAt = day(1)) => ({
  unit: "SESSION", nameSnapshot: "吉他課", termSessionIds: [], expiresAt: day(29),
  remaining: points, createdAt,
  plan: { points, musicTerms: 1, templateIds: ["guitar"] },
  entries: [{ points }], members: [{ customerId: student }], bookings: lessons,
});
const row = (student: string, current: ReturnType<typeof lesson>, enrollment: ReturnType<typeof card>, classType = "GROUP") => ({
  ...current, operatorCustomerId: null, operatorName: null, customerName: student,
  cardId: `card-${student}`, card: enrollment, bookingKind: "CARD", checkedInAt: null,
  trialPrice: null, trialPayments: [], notes: "",
  session: { ...current.session, requestKey: "series", requestIndex: 4,
    template: { classType, musicTermLessons: classType === "GROUP" ? 8 : 4 } },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.customers.mockResolvedValue([]);
  db.leaveCounts.mockResolvedValue([]);
  db.absences.mockResolvedValue([]);
  db.purchases.mockResolvedValue([]);
  db.cards.mockResolvedValue([]);
  db.sessionCount.mockResolvedValue(8);
});

it("tracks the fifth group lesson independently for learners who joined later", async () => {
  const first = Array.from({ length: 5 }, (_, index) => lesson("first", index));
  const third = Array.from({ length: 3 }, (_, index) => lesson("third", index + 2));
  const second = Array.from({ length: 4 }, (_, index) => lesson("second", index + 1));
  db.bookings.mockResolvedValue([
    row("first", first[4], card("first", first, 8)),
    row("third", third[2], card("third", third, 6)),
    row("second", second[3], card("second", second, 7)),
  ]);
  const result = await getCourseRoster("music-store", "session-4");
  expect(result.map(({ termIndex, termCount }) => [termIndex, termCount])).toEqual([[5, 8], [3, 6], [4, 7]]);
  expect(result.map(({ termLessons }) => termLessons.map(({ date }) => date.slice(0, 10)))).toEqual([
    ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"],
    ["2026-09-15", "2026-09-22", "2026-09-29"],
    ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"],
  ]);
});

it("keeps the current four lessons separate from a paid next term", async () => {
  const old = Array.from({ length: 4 }, (_, index) => lesson("student", index));
  const current = row("student", old[3], card("student", old, 4), "PRIVATE");
  db.bookings.mockResolvedValue([current]);
  db.purchases.mockResolvedValue([
    { customerId: "student", cardId: "card-student", points: 4, price: 3200, paymentMethod: "CASH", confirmedAt: day(1) },
    { customerId: "student", cardId: "next-card", points: 8, price: 6400, paymentMethod: "BANK_TRANSFER", confirmedAt: day(29) },
  ]);
  db.cards.mockResolvedValue([{ id: "next-card", createdAt: day(29), remaining: 8, plan: { templateIds: ["guitar"] }, bookings: [{ customerId: "student", status: "RESERVED", absenceKind: null, session: { startsAt: new Date("2026-10-06T10:00:00.000Z") } }] }]);
  const [result] = await getCourseRoster("music-store", "session-3");
  expect([result.termIndex, result.termCount, result.nextPaidLessons]).toEqual([4, 4, 8]);
  expect(result.termLessons).toHaveLength(4);
  expect(result.termPayment).toEqual({ date: day(1).toISOString(), amount: 3200, method: "CASH" });
  expect(result.nextTerm).toEqual({ payment: { date: day(29).toISOString(), amount: 6400, method: "BANK_TRANSFER" }, lessons: [{ date: "2026-10-06T10:00:00.000Z", status: "待上課" }] });
});

it("retains private leave dates without spending a lesson when makeup is scheduled", async () => {
  const attended = lesson("student", 0);
  const leave = lesson("student", 1, "CANCELLED", "STUDENT_LEAVE");
  const makeup = lesson("student", 2);
  const current = lesson("student", 3, "RESERVED");
  db.bookings.mockResolvedValue([row("student", current, card("student", [attended, leave, makeup, current], 4), "PRIVATE")]);
  const [result] = await getCourseRoster("music-store", "session-3");
  expect([result.termIndex, result.termCount, result.termLeaveCount]).toEqual([3, 4, 1]);
  expect(result.termLessons.map(({ date }) => date.slice(0, 10))).toEqual(["2026-09-01", "2026-09-15", "2026-09-22"]);
  expect(result.termPrivateLeaves.map((date) => date.slice(0, 10))).toEqual(["2026-09-08"]);
});

it("counts group leave and no-show separately while both consume a group lesson", async () => {
  const first = lesson("student", 0);
  const leave = lesson("student", 1, "CANCELLED", "GROUP_LEAVE_FORFEITED");
  const absent = lesson("student", 2, "NO_SHOW");
  const current = lesson("student", 3, "RESERVED");
  db.bookings.mockResolvedValue([row("student", current, card("student", [first, leave, absent, current], 8))]);
  const [result] = await getCourseRoster("music-store", "session-3");
  expect([result.termIndex, result.termCount, result.termLeaveCount, result.termNoShowCount]).toEqual([4, 8, 1, 1]);
  expect(result.termLessons.map(({ status }) => status)).toEqual(["已出席", "請假", "曠課", "待上課"]);
});
