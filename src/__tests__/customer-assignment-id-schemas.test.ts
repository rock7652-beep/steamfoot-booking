/**
 * Customer assignment ID schemas — hotfix regression
 *
 * 背景：先前 `assignedStaffId` / `customerId` 等欄位用 `z.string().cuid()`，
 * 但 prod 部分 staff/customer 的 ID 不是標準 cuid 格式（seed / 歷史資料 /
 * 不同工具產生）。Zod cuid 驗證失敗 → handleActionError 顯示自訂訊息
 * 「請選擇歸屬店長」，但實際上 UI 確實選了店長，使用者困惑。
 *
 * Hotfix：把 ID 欄位放寬成 `.min(1)`（非空字串）。真實存在性由 server
 * action 內的 DB lookup 確認（staff.findUnique / customer.findUnique），
 * Zod 不該比 DB 還嚴格而誤拒真實 ID。
 *
 * 本檔直接驗 schema 行為，不經過 action 也不需要 mock。
 */

import { describe, it, expect } from "vitest";
import {
  updateCustomerAssignmentSchema,
  bulkUpdateCustomerAssignmentSchema,
} from "@/lib/validators/customer";

// ── updateCustomerAssignmentSchema ────────────────────────────────────

describe("updateCustomerAssignmentSchema — 單筆 drawer 用", () => {
  it("接受 cuid v1 格式（向後相容）", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "ck0aaaaa1234567890abcdefg",
      assignedStaffId: "ck0bbbbb1234567890abcdefg",
    });
    expect(r.success).toBe(true);
  });

  it("接受 UUID 格式（含 hyphen）— 修復前會被 cuid() 擋", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "12345678-1234-1234-1234-123456789012",
      assignedStaffId: "abcdef01-2345-6789-abcd-ef0123456789",
    });
    expect(r.success).toBe(true);
  });

  it("接受任意非空字串 ID（DB 才是真實檢查）", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "custom_id_001",
      assignedStaffId: "staff_001",
    });
    expect(r.success).toBe(true);
  });

  it("assignedStaffId 為空字串 → 顯示「請選擇歸屬店長」", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "any-non-empty",
      assignedStaffId: "",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe("請選擇歸屬店長");
  });

  it("customerId 為空字串 → 仍失敗", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "",
      assignedStaffId: "any-non-empty",
    });
    expect(r.success).toBe(false);
  });

  it("referredByCustomerId 可為 null（清除推薦人）", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "any-non-empty",
      assignedStaffId: "any-non-empty",
      referredByCustomerId: null,
    });
    expect(r.success).toBe(true);
  });

  it("referredByCustomerId 可省略", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "any-non-empty",
      assignedStaffId: "any-non-empty",
    });
    expect(r.success).toBe(true);
  });

  it("referredByCustomerId 為非 cuid 但非空 → 接受", () => {
    const r = updateCustomerAssignmentSchema.safeParse({
      customerId: "any-non-empty",
      assignedStaffId: "any-non-empty",
      referredByCustomerId: "12345678-1234-1234-1234-123456789012",
    });
    expect(r.success).toBe(true);
  });
});

// ── bulkUpdateCustomerAssignmentSchema ────────────────────────────────

describe("bulkUpdateCustomerAssignmentSchema — 批次指派用", () => {
  it("接受 UUID / hyphen 格式的 customerIds 與 assignedStaffId", () => {
    const r = bulkUpdateCustomerAssignmentSchema.safeParse({
      customerIds: ["abc-def-1234", "xyz-uvw-5678"],
      assignedStaffId: "12345678-1234-1234-1234-123456789012",
    });
    expect(r.success).toBe(true);
  });

  it("接受混合 cuid / UUID / 自訂格式的 customerIds", () => {
    const r = bulkUpdateCustomerAssignmentSchema.safeParse({
      customerIds: [
        "ck0aaaaa1234567890abcdefg",
        "12345678-1234-1234-1234-123456789012",
        "custom_id_001",
      ],
      assignedStaffId: "any-non-empty",
    });
    expect(r.success).toBe(true);
  });

  it("customerIds 空陣列 → 顯示「請選擇至少一位顧客」", () => {
    const r = bulkUpdateCustomerAssignmentSchema.safeParse({
      customerIds: [],
      assignedStaffId: "any-non-empty",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe("請選擇至少一位顧客");
  });

  it("customerIds 超過 100 筆 → 顯示「單次最多 100 位」", () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const r = bulkUpdateCustomerAssignmentSchema.safeParse({
      customerIds: tooMany,
      assignedStaffId: "any-non-empty",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe("單次最多 100 位");
  });

  it("customerIds 含空字串 → 失敗（單筆 id 不可空）", () => {
    const r = bulkUpdateCustomerAssignmentSchema.safeParse({
      customerIds: ["ok-id", ""],
      assignedStaffId: "any-non-empty",
    });
    expect(r.success).toBe(false);
  });

  it("assignedStaffId 為空字串 → 顯示「請選擇歸屬店長」", () => {
    const r = bulkUpdateCustomerAssignmentSchema.safeParse({
      customerIds: ["any-non-empty"],
      assignedStaffId: "",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    // 多個 issue 時，issues[0] 應為 assignedStaffId 的訊息
    const hasMsg = r.error.issues.some((i) => i.message === "請選擇歸屬店長");
    expect(hasMsg).toBe(true);
  });
});
