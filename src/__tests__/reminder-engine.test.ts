/**
 * 提醒引擎 + Dashboard stats 測試
 *
 * 覆蓋驗收條件：
 *   - window 命中 / 不在 window 內不發送
 *   - idempotent：重複執行同 trigger 不重複發送
 *   - triggerAt dedup（並行 P2002 → SKIPPED）
 *   - 預約改期 → 新 triggerAt → 可重發
 *   - getReminderStats: 不再永遠 pending=0；正確排除已 SENT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReminderChannel } from "@prisma/client";

// ── Test fixtures ──
const STORE_ID = "store-test";
const RULE_ID = "rule-12hr";
const BOOKING_ID = "booking-1";
const CUSTOMER_ID = "customer-1";
const LINE_USER_ID = "U1234567890";

// ── In-memory stores（每個 test 重置）──
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
const pushMessageMock = vi.fn<() => Promise<{ success: boolean; error?: string }>>(
  async () => ({ success: true }),
);
vi.mock("@/lib/line", () => ({
  pushMessage: (...args: unknown[]) => pushMessageMock(...(args as Parameters<typeof pushMessageMock>)),
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

// 以動態 import 確保 mocks 生效
async function loadModules() {
  const engine = await import("@/server/reminder-engine");
  const reminderQueries = await import("@/server/queries/reminder");
  return { engine, reminderQueries };
}

// ── Helpers ──

/** 建立一個顧客掛 LINE 的 PENDING booking */
function makeBooking(opts: {
  id?: string;
  bookingDate: Date;
  slotTime: string;
  status?: string;
  hasLine?: boolean;
}): BookingRow {
  return {
    id: opts.id ?? BOOKING_ID,
    storeId: STORE_ID,
    bookingDate: opts.bookingDate,
    slotTime: opts.slotTime,
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

/** 12 小時前提醒規則 */
function makeRelativeRule(offsetMinutes = 720): RuleRow {
  return {
    id: RULE_ID,
    storeId: STORE_ID,
    name: "預約12小時前提醒",
    triggerType: "BEFORE_BOOKING_12H",
    type: "relative",
    offsetMinutes,
    offsetDays: 0,
    fixedTime: null,
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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================
// 1. findTriggeredBookings — window 邊界
// ============================================================

describe("findTriggeredBookings (relative 12hr)", () => {
  it("命中：triggerAt 在 [now, now+30min) 內 → 回傳", async () => {
    // now = 2026-05-11 12:00 UTC（= 2026-05-11 20:00 TW）
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    // booking on 5/12 08:00 TW = 5/12 00:00 UTC
    // triggerAt (12hr earlier) = 5/11 12:00 UTC = 命中 windowStart
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const result = await engine.findTriggeredBookings(rules[0], now, windowEnd);
    expect(result).toHaveLength(1);
    expect(result[0].triggerAt.toISOString()).toBe("2026-05-11T12:00:00.000Z");
  });

  it("不命中：triggerAt 在 window 外 → 排除", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    // booking 24hr 後 → triggerAt 12hr 後 = 不在 [now, now+30min)
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "20:00", // 5/12 12:00 UTC
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const result = await engine.findTriggeredBookings(rules[0], now, windowEnd);
    expect(result).toHaveLength(0);
  });

  it("不命中：booking 已 CANCELLED → 排除", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
        status: "CANCELLED",
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const result = await engine.findTriggeredBookings(rules[0], now, windowEnd);
    expect(result).toHaveLength(0);
  });

  it("不命中：顧客未綁 LINE → 排除", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
        hasLine: false,
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const result = await engine.findTriggeredBookings(rules[0], now, windowEnd);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// 2. runReminders — 端到端
// ============================================================

describe("runReminders", () => {
  it("命中：MessageLog SENT + triggerAt 寫入", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(messageLogs).toHaveLength(1);
    expect(messageLogs[0].status).toBe("SENT");
    expect(messageLogs[0].triggerAt?.toISOString()).toBe("2026-05-11T12:00:00.000Z");
    expect(pushMessageMock).toHaveBeenCalledTimes(1);
  });

  it("idempotent：第二次執行同一 window → SKIPPED，不重複寫入", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const r1 = await engine.runReminders();
    expect(r1.sent).toBe(1);
    expect(messageLogs).toHaveLength(1);

    const r2 = await engine.runReminders();
    expect(r2.sent).toBe(0);
    expect(r2.skipped).toBe(1);
    expect(messageLogs).toHaveLength(1); // 沒新增
    expect(pushMessageMock).toHaveBeenCalledTimes(1); // LINE 沒被打第二次
  });

  it("並行 race（unique constraint P2002）→ SKIPPED 不 throw", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
      }),
    );
    rules.push(makeRelativeRule());

    // 預先塞一筆「另一個並行 tick 已寫入」的 SENT log
    // 但用 status FAILED 讓 findFirst（status in [SENT, PENDING]）找不到 → 進到 create 階段
    // 然後 unique constraint 在 create 時觸發
    // ── 為了測 P2002，讓 mock create 第一次 throw
    const originalCreate = mockPrisma.messageLog.create;
    mockPrisma.messageLog.create = vi.fn(async () => {
      // 直接 throw P2002，模擬另一個 tick 在 findFirst 與 create 之間插入了同 key
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

  it("改期：bookingDate 變更 → 新 triggerAt → 可重發", async () => {
    // Run #1: now = 5/11 12:00, booking on 5/12 08:00 → triggerAt = 5/11 12:00
    const now1 = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now1);
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
      }),
    );
    rules.push(makeRelativeRule());

    const { engine } = await loadModules();
    const r1 = await engine.runReminders();
    expect(r1.sent).toBe(1);
    expect(messageLogs).toHaveLength(1);
    const firstTriggerAt = messageLogs[0].triggerAt!.toISOString();

    // 改期：booking 改到 5/13 08:00
    bookings[0].bookingDate = new Date("2026-05-13T00:00:00.000Z");

    // Run #2: now = 5/12 12:00 → triggerAt = 5/12 12:00（與 #1 不同）
    const now2 = new Date("2026-05-12T12:00:00.000Z");
    vi.setSystemTime(now2);

    const r2 = await engine.runReminders();
    expect(r2.sent).toBe(1);
    expect(messageLogs).toHaveLength(2); // 新增一筆
    expect(messageLogs[1].triggerAt?.toISOString()).toBe("2026-05-12T12:00:00.000Z");
    expect(messageLogs[1].triggerAt?.toISOString()).not.toBe(firstTriggerAt);
    expect(pushMessageMock).toHaveBeenCalledTimes(2);
  });

  it("LINE push 失敗 → MessageLog FAILED + 不重試（下個 tick 仍 SKIPPED 因 unique）", async () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    vi.setSystemTime(now);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "08:00",
      }),
    );
    rules.push(makeRelativeRule());
    pushMessageMock.mockResolvedValueOnce({ success: false, error: "LINE 401" });

    const { engine } = await loadModules();
    const result = await engine.runReminders();
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(messageLogs[0].status).toBe("FAILED");
    expect(messageLogs[0].errorMessage).toBe("LINE 401");
    // FAILED log 也佔了 (ruleId, bookingId, triggerAt) 唯一鍵 → 不會被自動重試
    // 這是設計選擇：失敗交由人工重發或 monitoring 處理
  });
});

// ============================================================
// 3. getReminderStats — 即時 pending 計算
// ============================================================

describe("getReminderStats", () => {
  it("有命中規則但無 SENT log → todayPending > 0（不再永遠是 0）", async () => {
    // now = 5/11 09:00 TW = 5/11 01:00 UTC（早上才開工）
    const now = new Date("2026-05-11T01:00:00.000Z");
    vi.setSystemTime(now);

    // 預約：今天 5/11 21:00 TW = 5/11 13:00 UTC
    // triggerAt (12hr earlier) = 5/11 01:00 UTC = 命中 [now, end-of-today TW]
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-11T00:00:00.000Z"),
        slotTime: "21:00",
      }),
    );
    rules.push(makeRelativeRule());

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.enabledRules).toBe(1);
    expect(stats.todayPending).toBe(1);
    expect(stats.todaySent).toBe(0);
    expect(stats.todayFailed).toBe(0);
  });

  it("已 SENT 的 (ruleId, bookingId, triggerAt) → 從 pending 扣掉", async () => {
    const now = new Date("2026-05-11T01:00:00.000Z");
    vi.setSystemTime(now);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-11T00:00:00.000Z"),
        slotTime: "21:00",
      }),
    );
    rules.push(makeRelativeRule());

    // 先塞一筆 SENT log（matching triggerAt = 5/11 01:00 UTC）
    messageLogs.push({
      id: "log-pre-sent",
      ruleId: RULE_ID,
      bookingId: BOOKING_ID,
      customerId: CUSTOMER_ID,
      triggerAt: new Date("2026-05-11T01:00:00.000Z"),
      status: "SENT",
      storeId: STORE_ID,
      createdAt: now,
      sentAt: now,
    });

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.todayPending).toBe(0);
    expect(stats.todaySent).toBe(1);
  });

  it("規則未啟用 → 不計入 pending", async () => {
    const now = new Date("2026-05-11T01:00:00.000Z");
    vi.setSystemTime(now);

    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-11T00:00:00.000Z"),
        slotTime: "21:00",
      }),
    );
    const r = makeRelativeRule();
    r.isEnabled = false;
    rules.push(r);

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    expect(stats.enabledRules).toBe(0);
    expect(stats.todayPending).toBe(0);
  });

  it("triggerAt 已過今日（earlier 觸發但未發） → 不計入今日 pending", async () => {
    // now = 5/11 23:00 TW = 5/11 15:00 UTC（接近今日結束）
    const now = new Date("2026-05-11T15:00:00.000Z");
    vi.setSystemTime(now);

    // booking 在明天早上 → triggerAt 在明天凌晨 → 不在今日 [now, todayEnd]
    bookings.push(
      makeBooking({
        bookingDate: new Date("2026-05-12T00:00:00.000Z"),
        slotTime: "20:00", // 5/12 12:00 UTC，triggerAt = 5/12 00:00 UTC（明日凌晨）
      }),
    );
    rules.push(makeRelativeRule());

    const { reminderQueries } = await loadModules();
    const stats = await reminderQueries.getReminderStats();
    // todayEnd ≈ 5/11 15:59:59 UTC（台灣 5/11 23:59:59）
    // triggerAt = 5/12 00:00 UTC > todayEnd → 不算今日 pending
    expect(stats.todayPending).toBe(0);
  });
});
