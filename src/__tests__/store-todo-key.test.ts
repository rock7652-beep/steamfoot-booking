/**
 * customerIdFromTodoId — PR-149 去重回歸保護
 *
 * 背景：PR-149 把 FOLLOW_UP / LOW_SESSIONS 的 todoKey 從 2 段改 3 段
 * （內嵌狀態 token），舊版 `slice(indexOf(":")+1)` 取「冒號後全部」會
 * 被打破（followup:cust:date → 回 "cust:date"，同顧客不同日期無法去重）。
 * 改取 seg[1]。本檔鎖住四種 key 格式的解析行為。
 *
 * 純函式測試，不需 DB / mock。dismiss 過濾 / per-user 隔離 / 狀態 key
 * 重現屬 DB 整合行為，走 staging preview smoke test，不在 vitest（node 無 DB）。
 */

import { describe, it, expect } from "vitest";
import { customerIdFromTodoId } from "@/lib/store-todo-key";

describe("customerIdFromTodoId — 新 3 段 key 格式去重", () => {
  it("PAYMENT: payment:txId → 取 txId（PAYMENT 已在 dedupe 前排除，值不影響結果）", () => {
    expect(customerIdFromTodoId("payment:tx_abc123")).toBe("tx_abc123");
  });

  it("BOOKING: booking:bookingId → 取 bookingId（維持原行為，各 booking 自成 bucket）", () => {
    expect(customerIdFromTodoId("booking:bk_xyz789")).toBe("bk_xyz789");
  });

  it("FOLLOW_UP: followup:cust:date → 取 customerId（不含 date 段）", () => {
    expect(customerIdFromTodoId("followup:cust_001:2026-05-01")).toBe(
      "cust_001"
    );
  });

  it("LOW_SESSIONS: lowsessions:cust:walletToken → 取 customerId（不含 wallet 段）", () => {
    expect(
      customerIdFromTodoId("lowsessions:cust_002:wallet_a+wallet_b")
    ).toBe("cust_002");
  });

  it("同顧客 FOLLOW_UP 不同 lastBookingDate → 同一 customerId（可正確跨型別去重）", () => {
    const a = customerIdFromTodoId("followup:cust_777:2026-04-01");
    const b = customerIdFromTodoId("followup:cust_777:2026-05-15");
    expect(a).toBe("cust_777");
    expect(b).toBe("cust_777");
    expect(a).toBe(b); // 同顧客 → dedupe 會合併（保留最高優先級）
  });

  it("同顧客 FOLLOW_UP 與 LOW_SESSIONS → 同一 customerId（跨型別去重 key 一致）", () => {
    expect(customerIdFromTodoId("followup:cust_555:2026-03-01")).toBe(
      customerIdFromTodoId("lowsessions:cust_555:w1")
    );
  });

  it("不同顧客 → 不同 customerId（不會被誤合併）", () => {
    expect(customerIdFromTodoId("lowsessions:cust_A:w1")).not.toBe(
      customerIdFromTodoId("lowsessions:cust_B:w1")
    );
  });

  it("無冒號 / 空字串 → null（不丟例外）", () => {
    expect(customerIdFromTodoId("garbage")).toBeNull();
    expect(customerIdFromTodoId("")).toBeNull();
  });

  it("第二段為空（followup::date）→ null", () => {
    expect(customerIdFromTodoId("followup::2026-05-01")).toBeNull();
  });

  it("舊 2 段格式仍可解析（向後相容，萬一有殘留舊 key）", () => {
    expect(customerIdFromTodoId("followup:cust_legacy")).toBe("cust_legacy");
    expect(customerIdFromTodoId("lowsessions:cust_legacy")).toBe(
      "cust_legacy"
    );
  });
});
