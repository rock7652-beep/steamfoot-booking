import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  guard: vi.fn(),
  query: vi.fn(),
  count: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/industry-module-server", () => ({ requireSpaStore: m.guard }));
vi.mock("@/lib/spa-db", () => ({
  spaPrisma: { $queryRaw: m.query, spaReceipt: { count: m.count } },
}));
import { getSpaRevenue } from "@/server/queries/spa-revenue";
beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockResolvedValue(undefined);
  m.count.mockResolvedValue(3);
  m.query
    .mockResolvedValueOnce([
      { collected: 1500, refunded: 500, count: BigInt(4) },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ count: BigInt(3) }]);
});
it("guards the SPA store and scopes each ledger source, local date range and payment filter", async () => {
  const result = await getSpaRevenue(
    "test-store",
    "2026-09-01",
    "2026-09-11",
    "TRANSFER",
    2,
  );
  expect(result).toMatchObject({
    collected: 1500,
    refunded: 500,
    count: 4,
    completed: 3,
  });
  expect(m.guard).toHaveBeenCalledWith("test-store");
  for (const [sql] of m.query.mock.calls.slice(0, 2)) {
    expect(
      sql.values.filter((v: unknown) => v === "test-store").length,
    ).toBeGreaterThanOrEqual(3);
    expect(sql.values).toContain("TRANSFER");
    expect(
      sql.values.some(
        (v: unknown) =>
          v instanceof Date && v.toISOString() === "2026-08-31T16:00:00.000Z",
      ),
    ).toBe(true);
    expect(sql.sql).not.toMatch(/FROM "(?:Transaction|Booking)"/);
  }
  expect(m.query.mock.calls[1][0].values).toContain(30);
});
it("does not query financial data if the store guard fails", async () => {
  m.guard.mockRejectedValue(new Error("not SPA"));
  await expect(
    getSpaRevenue("other", "2026-09-01", "2026-09-11", "", 1),
  ).rejects.toThrow();
  expect(m.query).not.toHaveBeenCalled();
});
