import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  resolveWriteStoreId: vi.fn(),
  findBookings: vi.fn(),
  upsert: vi.fn(),
  revalidateShopConfig: vi.fn(),
  revalidateDutyScheduling: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findMany: mocks.findBookings },
    shopConfig: { upsert: mocks.upsert },
  },
}));
vi.mock("@/lib/session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/store", () => ({
  resolveWriteStoreId: mocks.resolveWriteStoreId,
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateShopConfig: mocks.revalidateShopConfig,
  revalidateDutyScheduling: mocks.revalidateDutyScheduling,
}));
vi.mock("@/server/services/trial-plan", () => ({ ensureTrialPlan: vi.fn() }));
vi.mock("next/cache", () => ({
  updateTag: mocks.updateTag,
  revalidatePath: mocks.revalidatePath,
}));

import {
  updateBookableUntilDate,
  updateCustomerBookingWindow,
} from "@/server/actions/shop";

describe("顧客預約開放範圍設定", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T00:00:00.000Z"));
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ role: "ADMIN", storeId: null });
    mocks.resolveWriteStoreId.mockResolvedValue("branch-a");
    mocks.findBookings.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({ id: "config-a" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("開放至指定日期時立即生效，並清除舊的延後啟用設定", async () => {
    const result = await updateBookableUntilDate({ date: "2026-09-30" });

    expect(result.success).toBe(true);
    expect(mocks.findBookings).toHaveBeenCalledWith({
      where: {
        storeId: "branch-a",
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        bookingDate: { gte: new Date("2026-08-24T00:00:00.000Z") },
      },
      select: { bookingDate: true, slotTime: true },
      orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
    });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storeId: "branch-a" },
      create: {
        storeId: "branch-a",
        bookableUntilDate: new Date("2026-09-30T00:00:00.000Z"),
        bookingOpensAt: null,
      },
      update: {
        bookableUntilDate: new Date("2026-09-30T00:00:00.000Z"),
        bookingOpensAt: null,
      },
    });
  });

  it("指定日期早於既有預約時阻擋儲存", async () => {
    mocks.findBookings.mockResolvedValue([
      { bookingDate: new Date("2026-10-01T00:00:00.000Z"), slotTime: "10:00" },
    ]);

    const result = await updateBookableUntilDate({ date: "2026-09-30" });

    expect(result).toEqual({
      success: false,
      error: "2026/10/1 10:00 已有預約，請將開放截止日期設在該預約之後",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("縮短自動開放天數會影響既有預約時阻擋儲存", async () => {
    mocks.findBookings.mockResolvedValue([
      { bookingDate: new Date("2026-09-07T00:00:00.000Z"), slotTime: "09:00" },
    ]);

    const result = await updateCustomerBookingWindow({
      opensAt: null,
      days: 14,
    });

    expect(result).toEqual({
      success: false,
      error: "2026/9/7 09:00 已有預約，請將開放截止日期設在該預約之後",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("拒絕早於今天的截止日期", async () => {
    const result = await updateBookableUntilDate({ date: "2026-08-23" });

    expect(result).toEqual({
      success: false,
      error: "開放截止日期不可早於今天",
    });
    expect(mocks.findBookings).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("店長介面文案", () => {
  it("只呈現指定截止日期與自動天數兩種直覺選項", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/dashboard/settings/hours/bookable-until-form.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("開放至指定日期");
    expect(source).toContain("自動開放未來幾天");
    expect(source).toContain("目前開放預約至");
    expect(source).not.toContain("預約功能何時啟用？");
    expect(source).not.toContain("於指定日期時間啟用");
  });
});
