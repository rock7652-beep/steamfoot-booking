/**
 * Booking.revenueStaffId 快照規則 — PR-1.5a 鎖定測試
 *
 * 背景：prod audit (#125) 確認顧客直屬店長已 100% 覆蓋有 booking 的顧客，
 * 但歷史 23 筆 booking 的 revenueStaffId 全為 null（建立時顧客還沒指派）。
 * 未來新 booking 應該以 customer.assignedStaffId 為快照來源。
 *
 * 本檔不重做行為改動（既有 booking.ts 邏輯本來就是 customer.assignedStaffId
 * ?? null），而是把這條設計規則鎖進測試：
 *   - 助 reviewer：每次有人改這條快照規則，這支測試會喊
 *   - 防回歸：禁止任何 silent fallback / silent customer write
 *
 * 對應規格：docs/staff-settlement-phase1-spec.md §3.4
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshotRevenueStaffForBooking } from "@/server/actions/booking-helpers";

// ── Pure helper behavioral lock ──────────────────────────────────────

describe("snapshotRevenueStaffForBooking — pure helper", () => {
  it("customer.assignedStaffId 有值 → 回傳該 staffId（直接快照）", () => {
    expect(snapshotRevenueStaffForBooking("staff-A")).toBe("staff-A");
  });

  it("customer.assignedStaffId 為 null → 回傳 null（歸店家，不偷補 owner）", () => {
    expect(snapshotRevenueStaffForBooking(null)).toBeNull();
  });

  it("看起來像 cuid 的 id 也直接快照（不做格式檢查）", () => {
    // PR #123 已把 schema cuid() 放寬為 min(1)，這裡也不做格式檢查
    const cuid = "ck1aaaaaa1234567890abcdef";
    expect(snapshotRevenueStaffForBooking(cuid)).toBe(cuid);
  });

  it("UUID 含 hyphen 也直接快照（不做格式檢查）", () => {
    const uuid = "12345678-1234-1234-1234-123456789012";
    expect(snapshotRevenueStaffForBooking(uuid)).toBe(uuid);
  });
});

// ── Source-level regression guards ────────────────────────────────────
//
// 這些 guard 直接讀 booking.ts 原始碼，確保 future regression（例如有人
// 為了「讓沒店長的 booking 也能結算」而引入 resolver fallback）會被測試
// 立刻擋下，而不是要等月結算出問題才發現。

const BOOKING_TS = resolve(
  __dirname,
  "..",
  "server",
  "actions",
  "booking.ts",
);
const BOOKING_SRC = readFileSync(BOOKING_TS, "utf8");

describe("booking.ts source — PR-1.5a 規則 guards", () => {
  it("不可 import resolveCustomerStaffAssignment（禁止 owner fallback）", () => {
    // 只擋 import 語句，不擋 JSDoc 內為了說明禁止項而提到的單字。
    expect(BOOKING_SRC).not.toMatch(/import[^;]*resolveCustomerStaffAssignment/);
  });

  it("不可呼叫 resolveCustomerStaffAssignment(...)（禁止 owner fallback）", () => {
    // 函式呼叫形式 — 即使有人用其他方式取得 reference 也擋。
    expect(BOOKING_SRC).not.toMatch(/resolveCustomerStaffAssignment\s*\(/);
  });

  it("不可把 assignedStaffId 當成 Customer 的 write target（防 silent re-assignment）", () => {
    // booking.ts 內現有 markCompleted 等 action 會 update customer 的
    // customerStage / selfBookingEnabled / lastVisitAt — 那些都不該觸及
    // Customer.assignedStaffId。Intent hash 可以合法包含 `assignedStaffId:`，
    // 因此 guard 必須鎖定 customer.update 的 data block，而非禁止整個檔案
    // 出現同名欄位。
    //
    // 這條 guard 同時擋掉：
    //   - data: { assignedStaffId: ... }
    //   - select: { assignedStaffId: ... } 也可，但目前不需 select 此欄
    expect(BOOKING_SRC).not.toMatch(
      /customer\.update\s*\(\s*\{[\s\S]{0,500}?data\s*:\s*\{[\s\S]{0,300}?assignedStaffId\s*:/,
    );
  });

  it("快照只能透過 snapshotRevenueStaffForBooking helper 寫入", () => {
    // 防止有人改成 inline 寫死 fallback 邏輯（例如 `?? someOwnerId`），
    // 繞過 helper 的 JSDoc 規則說明。
    expect(BOOKING_SRC).toMatch(
      /snapshotRevenueStaffForBooking\(\s*customer\.assignedStaffId/,
    );
  });
});
