import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseTransaction: m.transaction }));
import { checkCourseAccounts } from "@/server/reconciliation/course-checks";
describe("course account reconciliation", () => {
  it("uses one scoped snapshot and reports mismatches instead of replacing them with zero", async () => {
    m.transaction.mockImplementation(async (_store, work) => work({ $queryRaw: m.query }));
    m.query.mockResolvedValue([{ code: "course_refund_cash", checked: BigInt(2), mismatches: BigInt(1) }]);
    const result = await checkCourseAccounts("test-store");
    expect(m.transaction).toHaveBeenCalledWith("test-store", expect.any(Function));
    expect(m.query.mock.calls[0].slice(1)).toEqual(["test-store", "test-store", "test-store", "test-store"]);
    expect(result[0]).toMatchObject({ status: "mismatch", sources: { "已檢查筆數": 2, "不一致筆數": 1 } });
  });
  it("propagates query failure so the engine records an error, never a pass", async () => {
    m.transaction.mockRejectedValueOnce(new Error("unavailable"));
    await expect(checkCourseAccounts("test-store")).rejects.toThrow("unavailable");
  });
});
