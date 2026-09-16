import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ manager: vi.fn(), customer: vi.fn(), update: vi.fn(), upsert: vi.fn(), records: vi.fn(), summary: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/native-health-service", () => ({ getNativeHealthSummary: m.summary, calculateNativeBmi: () => 23.4 }));
vi.mock("@/lib/db", () => ({ prisma: {
  customer: { findFirst: m.customer }, customerHealthRecord: { findMany: m.records },
  $transaction: async (work: (tx: unknown) => unknown) => work({ customer: { findFirst: m.customer }, customerHealthRecord: { updateMany: m.update, upsert: m.upsert } }),
} }));
import { loadCourseHealth, saveCourseHealth } from "@/server/actions/course-health";
import { AppError } from "@/lib/errors";
const input = { customerId: "customer-a", requestId: "8b8174b1-9514-4f3f-b10a-3b4e6dd801fa", measuredAt: "2026-01-01", weight: "60", note: "測試" };
beforeEach(() => { vi.clearAllMocks(); m.manager.mockResolvedValue({ storeId: "store-a" }); m.customer.mockResolvedValue({ id: "customer-a", height: 160 }); m.update.mockResolvedValue({ count: 1 }); m.records.mockResolvedValue([]); m.summary.mockResolvedValue({ latest: null }); });
describe("course health scope", () => {
  it("reads health only for the authorized store and customer", async () => {
    expect((await loadCourseHealth("customer-a")).success).toBe(true);
    expect(m.manager).toHaveBeenCalledWith("customer.read");
    expect(m.summary).toHaveBeenCalledWith("customer-a", "store-a");
    expect(m.records.mock.calls[0][0].where).toEqual({ customerId: "customer-a", storeId: "store-a" });
  });
  it("rejects foreign customers before any health lookup", async () => {
    m.customer.mockResolvedValue(null);
    expect((await loadCourseHealth("foreign")).success).toBe(false);
    expect(m.summary).not.toHaveBeenCalled();
  });
  it("requires write permission before saving", async () => {
    m.manager.mockRejectedValue(new AppError("FORBIDDEN", "無權限"));
    expect((await saveCourseHealth(input)).success).toBe(false);
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("uses a store/customer scoped retry key and computes BMI from existing height", async () => {
    expect((await saveCourseHealth(input)).success).toBe(true);
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ storeId: "store-a", customerId: "customer-a", source: "COURSE", sourceRecordId: `store-a:customer-a:${input.requestId}`, weight: 60, bmi: 23.4 }), update: {} }));
  });
  it("cannot edit a record belonging to a different store or person", async () => {
    m.update.mockResolvedValue({ count: 0 });
    expect((await saveCourseHealth({ ...input, id: "foreign-record" })).success).toBe(false);
    expect(m.update.mock.calls[0][0].where).toEqual({ id: "foreign-record", storeId: "store-a", customerId: "customer-a" });
  });
});
