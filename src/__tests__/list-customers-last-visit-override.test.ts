/**
 * overrideLastVisitFromCompletedBookings — pure regression
 *
 * 背景：prod 多數 Customer.lastVisitAt 是 stale/null，但顧客其實有
 * COMPLETED bookings。本 PR 修 listCustomers 顯示用的 lastVisitAt
 * 改成「最近一筆 COMPLETED booking.bookingDate」，但不 backfill、不
 * 動 booking 完成流程、不動 schema。
 *
 * Helper 抽出為 pure function 便於單測，不需 mock Prisma。
 */

import { describe, it, expect } from "vitest";
import { overrideLastVisitFromCompletedBookings } from "@/server/queries/customer-list-helpers";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("overrideLastVisitFromCompletedBookings", () => {
  it("有 COMPLETED booking → 用 booking 的 bookingDate 覆蓋 Customer.lastVisitAt", () => {
    const customers = [
      { id: "c1", lastVisitAt: null },
      { id: "c2", lastVisitAt: D("2024-01-01") }, // stale 舊值
    ];
    const groups = [
      { customerId: "c1", _max: { bookingDate: D("2026-05-01") } },
      { customerId: "c2", _max: { bookingDate: D("2026-05-10") } },
    ];
    const result = overrideLastVisitFromCompletedBookings(customers, groups);
    expect(result[0].lastVisitAt).toEqual(D("2026-05-01"));
    expect(result[1].lastVisitAt).toEqual(D("2026-05-10")); // 舊 stale 值被覆蓋
  });

  it("無 COMPLETED booking → 退回 Customer.lastVisitAt（向後相容）", () => {
    const customers = [
      { id: "c1", lastVisitAt: D("2024-01-01") }, // 舊資料保留
      { id: "c2", lastVisitAt: null }, // 真的沒來店 → 顯示 null（UI 顯示「—」）
    ];
    const groups: Array<{ customerId: string; _max: { bookingDate: Date | null } }> = [];
    const result = overrideLastVisitFromCompletedBookings(customers, groups);
    expect(result[0].lastVisitAt).toEqual(D("2024-01-01"));
    expect(result[1].lastVisitAt).toBeNull();
  });

  it("混合：部分顧客有 booking、部分沒有", () => {
    const customers = [
      { id: "c1", lastVisitAt: null }, // 有 booking
      { id: "c2", lastVisitAt: D("2024-01-01") }, // 沒 booking → 保留舊值
      { id: "c3", lastVisitAt: null }, // 沒 booking 也沒舊值 → null
    ];
    const groups = [
      { customerId: "c1", _max: { bookingDate: D("2026-04-15") } },
    ];
    const result = overrideLastVisitFromCompletedBookings(customers, groups);
    expect(result[0].lastVisitAt).toEqual(D("2026-04-15"));
    expect(result[1].lastVisitAt).toEqual(D("2024-01-01"));
    expect(result[2].lastVisitAt).toBeNull();
  });

  it("booking groupBy 回 null max（理論上不該發生但防呆）→ 退回 stale 值", () => {
    const customers = [{ id: "c1", lastVisitAt: D("2024-01-01") }];
    const groups = [{ customerId: "c1", _max: { bookingDate: null } }];
    const result = overrideLastVisitFromCompletedBookings(customers, groups);
    // nullish coalescing：null ?? fallback → fallback。
    // 即「booking row 存在但 max 為 null」這個防呆情境，退回 Customer.lastVisitAt。
    expect(result[0].lastVisitAt).toEqual(D("2024-01-01"));
  });

  it("不修改其他欄位（只覆寫 lastVisitAt）", () => {
    const customers = [
      { id: "c1", lastVisitAt: null, name: "Alice", phone: "0900000000" },
    ];
    const groups = [
      { customerId: "c1", _max: { bookingDate: D("2026-05-01") } },
    ];
    const result = overrideLastVisitFromCompletedBookings(customers, groups);
    expect(result[0]).toEqual({
      id: "c1",
      lastVisitAt: D("2026-05-01"),
      name: "Alice",
      phone: "0900000000",
    });
  });

  it("輸入空陣列 → 回傳空陣列", () => {
    expect(overrideLastVisitFromCompletedBookings([], [])).toEqual([]);
  });
});
