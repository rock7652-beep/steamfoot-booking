import { describe, expect, it } from "vitest";
import {
  computeRefundPlan,
  REFUND_ERROR_MESSAGES,
  type SessionLite,
} from "@/lib/refund-plan";

// 測試輔助：產 N 筆指定 status 的 session
function sessions(spec: Partial<Record<SessionLite["status"], number>>): SessionLite[] {
  const out: SessionLite[] = [];
  let counter = 1;
  for (const [status, count] of Object.entries(spec)) {
    for (let i = 0; i < (count ?? 0); i++) {
      out.push({ id: `s${counter++}`, status: status as SessionLite["status"] });
    }
  }
  return out;
}

describe("computeRefundPlan — happy paths", () => {
  it("FULL_UNUSED：3 堂全可用 → 全額退款", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "FULL_UNUSED",
      sessions: sessions({ AVAILABLE: 3 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refundAmount).toBe(1500);
    expect(result.sessionIdsToVoid).toHaveLength(3);
    expect(result.breakdown).toEqual({
      unitPrice: 500,
      availableCount: 3,
      completedCount: 0,
      reservedCount: 0,
    });
  });

  it("REMAINING_SESSIONS：用了 1 堂、退剩餘 2 堂", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "REMAINING_SESSIONS",
      sessions: sessions({ COMPLETED: 1, AVAILABLE: 2 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refundAmount).toBe(1000); // 500 × 2
    expect(result.sessionIdsToVoid).toHaveLength(2);
    expect(result.breakdown.unitPrice).toBe(500);
  });

  it("REMAINING_SESSIONS：完全沒用過也適用，等同全額退款的金額", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "REMAINING_SESSIONS",
      sessions: sessions({ AVAILABLE: 3 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refundAmount).toBe(1500); // 500 × 3
  });

  it("既有 VOIDED session 不影響計算", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "REMAINING_SESSIONS",
      sessions: sessions({ AVAILABLE: 1, VOIDED: 2 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refundAmount).toBe(500);
    expect(result.sessionIdsToVoid).toHaveLength(1);
  });
});

describe("computeRefundPlan — 4 個禁止情境（spec sec 七）", () => {
  it("有 RESERVED → 拒絕，不論 mode", () => {
    for (const mode of ["FULL_UNUSED", "REMAINING_SESSIONS"] as const) {
      const result = computeRefundPlan({
        originalAmount: 1500,
        totalSessions: 3,
        mode,
        sessions: sessions({ AVAILABLE: 1, RESERVED: 2 }),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("BUSINESS_RULE");
      expect(result.message).toBe(REFUND_ERROR_MESSAGES.HAS_RESERVED);
    }
  });

  it("FULL_UNUSED 模式 + 有 COMPLETED → 拒絕全額退款", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "FULL_UNUSED",
      sessions: sessions({ COMPLETED: 1, AVAILABLE: 2 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(REFUND_ERROR_MESSAGES.HAS_COMPLETED_FULL);
  });

  it("沒有 AVAILABLE 堂數 → 拒絕（防重複退款）", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "REMAINING_SESSIONS",
      sessions: sessions({ COMPLETED: 1, VOIDED: 2 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(REFUND_ERROR_MESSAGES.NO_AVAILABLE);
  });

  it("全部 COMPLETED → 拒絕（沒可退）", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 3,
      mode: "REMAINING_SESSIONS",
      sessions: sessions({ COMPLETED: 3 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(REFUND_ERROR_MESSAGES.NO_AVAILABLE);
  });
});

describe("computeRefundPlan — 計算 edge cases", () => {
  it("非整除金額：1499 / 3 → unitPrice 取四捨五入 (500)，refund=500×剩餘", () => {
    const result = computeRefundPlan({
      originalAmount: 1499,
      totalSessions: 3,
      mode: "REMAINING_SESSIONS",
      sessions: sessions({ COMPLETED: 1, AVAILABLE: 2 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.unitPrice).toBe(500); // round(499.67)
    expect(result.refundAmount).toBe(1000); // 500 × 2
  });

  it("FULL_UNUSED 即使非整除，仍退原始全額", () => {
    const result = computeRefundPlan({
      originalAmount: 1499,
      totalSessions: 3,
      mode: "FULL_UNUSED",
      sessions: sessions({ AVAILABLE: 3 }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refundAmount).toBe(1499); // 不用 unitPrice 算
  });

  it("totalSessions=0 → VALIDATION error", () => {
    const result = computeRefundPlan({
      originalAmount: 1500,
      totalSessions: 0,
      mode: "FULL_UNUSED",
      sessions: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("VALIDATION");
  });

  it("originalAmount<0 → VALIDATION error", () => {
    const result = computeRefundPlan({
      originalAmount: -100,
      totalSessions: 3,
      mode: "FULL_UNUSED",
      sessions: sessions({ AVAILABLE: 3 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("VALIDATION");
  });
});
