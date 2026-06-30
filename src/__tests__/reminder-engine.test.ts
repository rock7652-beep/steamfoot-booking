/**
 * 提醒引擎 + Dashboard stats 測試（v3：daily next-day batch）
 *
 * 覆蓋驗收條件：
 *   - 每天 18:00 命中明天預約 → SENT
 *   - 今天預約不提醒
 *   - 後天預約不提醒
 *   - CANCELLED / NO_SHOW 不提醒
 *   - 未綁 LINE 不提醒
 *   - 重複執行不重複提醒（idempotent）
 *   - dashboard pending 18:00 前正確反映明日預約數
 *   - dashboard pending 18:00 後一律 0
 *   - SENT 從 pending 扣除
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReminderChannel } from "@prisma/client";

// ── Test fixtures ──
const STORE_ID = "store-test";
const RULE_ID = "rule-1";
const BOOKING_ID = "booking-1";
const CUSTOMER_ID = "customer-1";
const LINE_USER_ID = "U1234567890";

// ── In-memory stores ──
type BookingRow = {
  id: string;
  storeId: string;
  bookingDate: Date;
  slotTime: string;
  bookingStatus: string;
  customer: {
    id: string;
    name: string;
    lineUserId: string | null;
    lineLinkStatus: string;
    assignedStaff: { displayName: string } | null;
  };
};
type RuleRow = {
  id: string;
  storeId: string;
  name: string;
  triggerType: string;
  type: string;
  offsetMinutes: number | null;
  offsetDays: number;
  fixedTime: string | null;
  isEnabled: boolean;
  channel: ReminderChannel;
  templateId: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: { body: string } | null;
};
type LogRow = {
  id: string;
  ruleId: string | null;
  bookingId: string | null;
  customerId: string;
  triggerAt: Date | null;
  status: string;
  storeId: string;
  createdAt: Date;
  sentAt: Date | null;
  templateId?: string | null;
  channel?: string;
  renderedBody?: string | null;
  errorMessage?: string | null;
};

let bookings: BookingRow[] = [];
let rules: RuleRow[] = [];
let messageLogs: LogRow[] = [];

// ── Mock Prisma P2002 error class ──
class MockPrismaError extends Error {
  code: string;
  clientVersion = "test";
  constructor(message: string, opts: { code: string }) {
    super(message);
    this.code = opts.code;
    this.name = "PrismaClientKnownRequestError";
  }
}

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: MockPrismaError },
}));

// ── Mock prisma client ──
const mockPrisma = {
  reminderRule: {
    findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return rules.filter((r) => {
        if (where.isEnabled !== undefined && r.isEnabled !== where.isEnabled) return false;
        if (where.storeId && r.storeId !== where.storeId) return false;
        return true;
      });
    }),
    count: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return rules.filter((r) => {
        if (where.isEnabled !== undefined && r.isEnabled !== where.isEnabled) return false;
        if (where.storeId && r.storeId !== where.storeId) return false;
        return true;
      }).length;
    }),
  },
  booking: {
    findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return bookings.filter((b) => {
        if (where.storeId && b.storeId !== where.storeId) return false;
        const statusFilter = where.bookingStatus as { in?: string[] } | undefined;
        if (statusFilter?.in && !statusFilter.in.includes(b.bookingStatus)) return false;
        const dateFilter = where.bookingDate;
        if (dateFilter instanceof Date) {
          if (b.bookingDate.getTime() !== dateFilter.getTime()) return false;
        } else if (typeof dateFilter === "object" && dateFilter !== null) {
          const r = dateFilter as { gte?: Date; lte?: Date };
          if (r.gte && b.bookingDate < r.gte) return false;
          if (r.lte && b.bookingDate > r.lte) return false;
        }
        const customerFilter = where.customer as
          | { lineLinkStatus?: string; lineUserId?: { not: null } }
          | undefined;
        if (customerFilter?.lineLinkStatus && b.customer.lineLinkStatus !== customerFilter.lineLinkStatus) {
          return false;
        }
        if (customerFilter?.lineUserId?.not !== undefined && b.customer.lineUserId === null) {
          return false;
        }
        return true;
      });
    }),
  },
  messageLog: {
    findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return (
        messageLogs.find((l) => {
          if (where.ruleId && l.ruleId !== where.ruleId) return false;
          if (where.bookingId && l.bookingId !== where.bookingId) return false;
          if (where.triggerAt instanceof Date) {
            if (!l.triggerAt || l.triggerAt.getTime() !== where.triggerAt.getTime()) return false;
          }
          const statusFilter = where.status as string | { in?: string[] } | undefined;
          if (typeof statusFilter === "string" && l.status !== statusFilter) return false;
          if (typeof statusFilter === "object" && statusFilter?.in && !statusFilter.in.includes(l.status)) {
            return false;
          }
          return true;
        }) ?? null
      );
    }),
    create: vi.fn(async ({ data }: { data: Partial<LogRow> }) => {
      // 模擬 unique (ruleId, bookingId, triggerAt) constraint
      if (data.ruleId && data.bookingId) {
        const dup = messageLogs.find(
          (l) =>
            l.ruleId === data.ruleId &&
            l.bookingId === data.bookingId &&
            l.triggerAt &&
            data.triggerAt &&
            l.triggerAt.getTime() === data.triggerAt.getTime(),
        );
        if (dup) {
          throw new MockPrismaError("Unique constraint failed", { code: "P2002" });
        }
      }
      const row: LogRow = {
        id: `log-${messageLogs.length + 1}`,
        ruleId: data.ruleId ?? null,
        bookingId: data.bookingId ?? null,
        customerId: data.customerId!,
        triggerAt: data.triggerAt ?? null,
        status: data.status!,
        storeId: data.storeId!,
        sentAt: data.sentAt ?? null,
        createdAt: new Date(),
        templateId: data.templateId ?? null,
        channel: data.channel ?? "LINE",
        renderedBody: data.renderedBody ?? null,
        errorMessage: data.errorMessage ?? null,
      };
      messageLogs.push(row);
      return row;
    }),
    count: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return messageLogs.filter((l) => {
        if (where.status && l.status !== where.status) return false;
        if (where.storeId && l.storeId !== where.storeId) return false;
        const sentAtFilter = where.sentAt as { gte?: Date; lte?: Date } | undefined;
        if (sentAtFilter) {
          if (sentAtFilter.gte && (!l.sentAt || l.sentAt < sentAtFilter.gte)) return false;
          if (sentAtFilter.lte && (!l.sentAt || l.sentAt > sentAtFilter.lte)) return false;
        }
        const createdAtFilter = where.createdAt as { gte?: Date; lte?: Date } | undefined;
        if (createdAtFilter) {
          if (createdAtFilter.gte && l.createdAt < createdAtFilter.gte) return false;
          if (createdAtFilter.lte && l.createdAt > createdAtFilter.lte) return false;
        }
        return true;
      }).length;
    }),
    findMany: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return messageLogs.filter((l) => {
        if (where.ruleId && l.ruleId !== where.ruleId) return false;
        if (where.status && l.status !== where.status) return false;
        if (where.triggerAt instanceof Date) {
          if (!l.triggerAt || l.triggerAt.getTime() !== where.triggerAt.getTime()) return false;
        }
        const bookingIdFilter = where.bookingId as { in?: string[] } | undefined;
        if (bookingIdFilter?.in && (!l.bookingId || !bookingIdFilter.in.includes(l.bookingId))) {
          return false;
        }
        return true;
      });
    }),
  },
  store: {
    findUnique: vi.fn(async () => null), // null = 跳過 usage gate
  },
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

// ── Mock LINE & 其他依賴 ──
const pushMessageMock = vi.fn(
  async (
    _storeId: string,
    _lineUserId: string,
    _messages: unknown[],
  ): Promise<{ success: boolean; error?: string }> => ({ success: true }),
);
vi.mock("@/lib/line", () => ({
  pushMessage: (storeId: string, lineUserId: string, messages: unknown[]) =>
    pushMessageMock(storeId, lineUserId, messages),
  renderTemplate: (body: string) => body,
}));
vi.mock("@/lib/shop-config", () => ({
  getShopConfig: async () => ({ shopName: "Test Shop" }),
}));
vi.mock("@/lib/usage-gate", () => ({
  checkReminderSendLimit: () => ({ allowed: true, current: 0, limit: 1000 }),
}));
vi.mock("@/lib/base-url", () => ({
  deriveBaseUrl: () => "https://test.example.com",
}));
vi.mock("@/lib/session", () => ({
  requireStaffSession: async () => ({
    id: "user-1",
    role: "OWNER",
    storeId: STORE_ID,
  }),
}));
vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: () => ({ storeId: STORE_ID }),
}));

async function loadModules() {
  const engine = await import("@/server/reminder-engine");
  const reminderQueries = await import("@/server/queries/reminder");
  return { engine, reminderQueries };
}

// ── Helpers ──

/** 建立一個 PENDING booking（指定 bookingDate） */
function makeBooking(opts: {
  id?: string;
  bookingDate: Date;
  slotTime?: string;
  status?: string;
  hasLine?: boolean;
}): BookingRow {
  return {
    id: opts.id ?? BOOKING_ID,
    storeId: STORE_ID,
    bookingDate: opts.bookingDate,
    slotTime: opts.slotTime ?? "14:00",
    bookingStatus: opts.status ?? "CONFIRMED",
    customer: {
      id: CUSTOMER_ID,
      name: "Alice",
      lineUserId: opts.hasLine === false ? null : LINE_USER_ID,
      lineLinkStatus: opts.hasLine === false ? "UNLINKED" : "LINKED",
      assignedStaff: { displayName: "Bob" },
    },
  };
}

function makeRule(): RuleRow {
  return {
    id: RULE_ID,
    storeId: STORE_ID,
    name: "預約前一天 18:00 提醒",
    triggerType: "BEFORE_BOOKING_1D",
    type: "fixed",
    offsetMinutes: null,
    offsetDays: 1,
    fixedTime: "18:00",
    isEnabled: true,
    channel: "LINE" as ReminderChannel,
    templateId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    template: null,
  };
}

beforeEach(() => {
  bookings = [];
  rules = [];
  messageLogs = [];
  pushMessageMock.mockClear();
  pushMessageMock.mockResolvedValue({ success: true });
  // Reset call records on prisma mocks（讓 not.toHaveBeenCalled() 斷言可靠）
  mockPrisma.reminderRule.findMany.mockClear();
  mockPrisma.reminderRule.count.mockClear();
  mockPrisma.booking.findMany.mockClear();
  mockPrisma.messageLog.findFirst.mockClear();
  mockPrisma.messageLog.create.mockClear();
  mockPrisma.messageLog.count.mockClear();
  mockPrisma.messageLog.findMany.mockClear();
  mockPrisma.store.findUnique.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================
// runReminders — daily next-day batch
// ============================================================

describe("runReminders (daily next-day batch)", () => {
  it("命中：明天 (TW) 的有效預約 → SENT，triggerAt = 今天 18:00 TW", async () => {
    // now = 5/11 12:00 TW = 5/11 04:00 UTC（假設 cron 提早觸發）
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"), // 明天
        slotTime: "14:00",
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(messageLogs).toHaveLength(1);
    expect(messageLogs[0].status).toBe("SENT");
    // triggerAt = 今天 18:00 TW = 今天 10:00 UTC
    expect(messageLogs[0].triggerAt?.toISOString()).toBe("2026-05-11T10:00:00.000Z");
    expect(pushMessageMock).toHaveBeenCalledTimes(1);
    expect(pushMessageMock).toHaveBeenCalledWith(STORE_ID, LINE_USER_ID, [
      { type: "text", text: expect.any(String) },
    ]);
  });

  it("不命中：今天的預約（不是明天）→ 不發送", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-11T00:00:00.000Z"), // 今天
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.total).toBe(0);
    expect(result.sent).toBe(0);
    expect(messageLogs).toHaveLength(0);
  });

  it("不命中：後天的預約 → 不發送", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-13T00:00:00.000Z"), // 後天
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.total).toBe(0);
    expect(messageLogs).toHaveLength(0);
  });

  it("不命中：CANCELLED 預約 → 不發送", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        status: "CANCELLED",
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(0);
    expect(messageLogs).toHaveLength(0);
  });

  it("不命中：NO_SHOW 預約 → 不發送", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        status: "NO_SHOW",
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(0);
    expect(messageLogs).toHaveLength(0);
  });

  it("不命中：顧客未綁 LINE → 不發送", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        hasLine: false,
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(0);
    expect(messageLogs).toHaveLength(0);
  });

  it("idempotent：同一天重跑兩次 → 第二次 SKIPPED 不重複寫入", async () => {
    vi.setSystemTime(new Date("2026-05-11T10:00:00.000Z")); // 剛好 18:00 TW
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const r1 = await engine.runReminders();
    expect(r1.sent).toBe(1);
    expect(messageLogs).toHaveLength(1);

    // 模擬同一天稍晚再 hit cron endpoint（手動觸發 / GitHub Actions retry）
    vi.setSystemTime(new Date("2026-05-11T14:00:00.000Z"));
    const r2 = await engine.runReminders();
    expect(r2.sent).toBe(0);
    expect(r2.skipped).toBe(1);
    expect(messageLogs).toHaveLength(1); // 沒新增
    expect(pushMessageMock).toHaveBeenCalledTimes(1); // LINE 沒被打第二次
  });

  it("並行 race（unique constraint P2002）→ SKIPPED 不 throw", async () => {
    vi.setSystemTime(new Date("2026-05-11T10:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
      }),
    );
    rules.push(makeRule());

    const originalCreate = mockPrisma.messageLog.create;
    mockPrisma.messageLog.create = vi.fn(async () => {
      throw new MockPrismaError("Unique constraint failed", { code: "P2002" });
    });

    try {
      const { engine } = await loadModules();
      const result = await engine.runReminders();
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    } finally {
      mockPrisma.messageLog.create = originalCreate;
    }
  });

  it("LINE push 失敗 → MessageLog FAILED", async () => {
    vi.setSystemTime(new Date("2026-05-11T10:00:00.000Z"));
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
      }),
    );
    rules.push(makeRule());
    pushMessageMock.mockResolvedValueOnce({ success: false, error: "LINE 401" });

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(messageLogs[0].status).toBe("FAILED");
    expect(messageLogs[0].errorMessage).toBe("LINE 401");
  });

  it("沒啟用規則 → 0 sent，不查 booking", async () => {
    vi.setSystemTime(new Date("2026-05-11T10:00:00.000Z"));
    bookings.push(
      makeBooking({ bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
    );
    // rules 為空

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.total).toBe(0);
    expect(result.sent).toBe(0);
    expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("一筆 booking 多筆預約：每筆都觸發一則提醒", async () => {
    vi.setSystemTime(new Date("2026-05-11T10:00:00.000Z"));
    bookings.push(
      makeBooking({
        id: "b1",
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "10:00",
      }),
      makeBooking({
        id: "b2",
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "16:00",
      }),
    );
    rules.push(makeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(2);
    expect(messageLogs).toHaveLength(2);
  });
});

// ============================================================
// getReminderStats — daily-batch dashboard 計算
// ============================================================

describe("getReminderStats (daily-batch model)", () => {
  it("18:00 前 + 有明日預約 + 無 SENT → todayPending = 預約數", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z")); // 12:00 TW
    bookings.push(
      makeBooking({ id: "b1", bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
      makeBooking({ id: "b2", bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
    );
    rules.push(makeRule());

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.enabledRules).toBe(1);
    expect(stats.todayPending).toBe(2);
    expect(stats.todaySent).toBe(0);
    expect(stats.todayFailed).toBe(0);
  });

  it("18:00 前 + 已 SENT 的預約 → 從 pending 扣除", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({ id: "b1", bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
      makeBooking({ id: "b2", bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
    );
    rules.push(makeRule());

    // b1 已經有 SENT log（matching today's triggerAt）
    messageLogs.push({
      id: "log-pre",
      ruleId: RULE_ID,
      bookingId: "b1",
      customerId: CUSTOMER_ID,
      triggerAt: new Date("2026-05-11T10:00:00.000Z"),
      status: "SENT",
      storeId: STORE_ID,
      createdAt: new Date("2026-05-11T04:00:00.000Z"),
      sentAt: new Date("2026-05-11T04:00:00.000Z"),
    });

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.todayPending).toBe(1); // b2 still pending
    expect(stats.todaySent).toBe(1);
  });

  it("18:00 後 → todayPending 一律 0（即使有未發送的明日預約）", async () => {
    vi.setSystemTime(new Date("2026-05-11T12:00:00.000Z")); // 20:00 TW
    bookings.push(
      makeBooking({ bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
    );
    rules.push(makeRule());

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.todayPending).toBe(0);
  });

  it("規則未啟用 → todayPending = 0", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({ bookingDate: new Date("2026-05-12T00:00:00.000Z") }),
    );
    const r = makeRule();
    r.isEnabled = false;
    rules.push(r);

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.enabledRules).toBe(0);
    expect(stats.todayPending).toBe(0);
  });

  it("CANCELLED / 未綁 LINE 的明日預約 → 不算入 pending", async () => {
    vi.setSystemTime(new Date("2026-05-11T04:00:00.000Z"));
    bookings.push(
      makeBooking({ id: "b1", bookingDate: new Date("2026-05-12T00:00:00.000Z"), status: "CANCELLED" }),
      makeBooking({ id: "b2", bookingDate: new Date("2026-05-12T00:00:00.000Z"), hasLine: false }),
      makeBooking({ id: "b3", bookingDate: new Date("2026-05-12T00:00:00.000Z") }), // 唯一有效
    );
    rules.push(makeRule());

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.todayPending).toBe(1); // 只有 b3
  });
});
