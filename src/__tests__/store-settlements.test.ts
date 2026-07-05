import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSettlementUpsert = vi.fn();
const mockSettlementFindMany = vi.fn();
const mockSettlementFindUnique = vi.fn();
const mockSettlementUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    storeSettlement: {
      upsert: (...args: unknown[]) => mockSettlementUpsert(...args),
      findMany: (...args: unknown[]) => mockSettlementFindMany(...args),
      findUnique: (...args: unknown[]) => mockSettlementFindUnique(...args),
      update: (...args: unknown[]) => mockSettlementUpdate(...args),
    },
  },
}));

function settlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "settlement-1",
    storeId: "store-1",
    storeName: "測試店",
    month: "2026-07",
    grossRevenue: 12000,
    refundAmount: 2000,
    netRevenue: 10000,
    transactionCount: 5,
    fixedMonthlyFee: 3000,
    revenueShareRate: 10,
    revenueShareAmount: 1000,
    additionalAmount: 500,
    deductionAmount: 200,
    finalReceivable: 12300,
    note: "本月調整",
    status: "DRAFT",
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
    updatedAt: new Date("2026-07-05T00:00:00.000Z"),
    store: { name: "測試店" },
    ...overrides,
  };
}

const input = {
  month: "2026-07",
  grossRevenue: 12000,
  refundAmount: 2000,
  netRevenue: 10000,
  transactionCount: 5,
  fixedMonthlyFee: 3000,
  revenueShareRate: 10,
  additionalAmount: 500,
  deductionAmount: 200,
  note: "本月調整",
  status: "DRAFT" as const,
};

describe("store settlements service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettlementUpsert.mockResolvedValue(settlement());
    mockSettlementFindMany.mockResolvedValue([]);
    mockSettlementFindUnique.mockResolvedValue(null);
    mockSettlementUpdate.mockResolvedValue(settlement({ status: "CONFIRMED" }));
  });

  it("creates a settlement for one store and month", async () => {
    const { saveStoreSettlementForStore } = await import("@/server/services/store-settlements");

    await saveStoreSettlementForStore({ storeId: "store-1", userId: "user-1", input });

    expect(mockSettlementUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_store_settlement_store_month: {
            storeId: "store-1",
            month: "2026-07",
          },
        },
        create: expect.objectContaining({
          storeId: "store-1",
          month: "2026-07",
          createdBy: "user-1",
          updatedBy: "user-1",
        }),
      }),
    );
  });

  it("updates a DRAFT settlement for the same store/month through the unique upsert key", async () => {
    const { saveStoreSettlementForStore } = await import("@/server/services/store-settlements");
    mockSettlementFindUnique.mockResolvedValueOnce({ status: "DRAFT" });

    await saveStoreSettlementForStore({ storeId: "store-1", userId: "user-1", input });

    expect(mockSettlementUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_store_settlement_store_month: {
            storeId: "store-1",
            month: "2026-07",
          },
        },
        update: expect.objectContaining({
          fixedMonthlyFee: 3000,
          updatedBy: "user-1",
        }),
      }),
    );
  });

  it("prevents save from overwriting a CONFIRMED settlement", async () => {
    const { saveStoreSettlementForStore, STORE_SETTLEMENT_CONFIRMED_LOCK_MESSAGE } =
      await import("@/server/services/store-settlements");
    mockSettlementFindUnique.mockResolvedValueOnce({ status: "CONFIRMED" });

    await expect(
      saveStoreSettlementForStore({ storeId: "store-1", userId: "user-1", input }),
    ).rejects.toThrow(STORE_SETTLEMENT_CONFIRMED_LOCK_MESSAGE);

    expect(mockSettlementUpsert).not.toHaveBeenCalled();
  });

  it("allows different stores to save the same month independently", async () => {
    const { saveStoreSettlementForStore } = await import("@/server/services/store-settlements");

    await saveStoreSettlementForStore({ storeId: "store-1", input });
    await saveStoreSettlementForStore({ storeId: "store-2", input });

    expect(mockSettlementUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { uq_store_settlement_store_month: { storeId: "store-1", month: "2026-07" } },
      }),
    );
    expect(mockSettlementUpsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { uq_store_settlement_store_month: { storeId: "store-2", month: "2026-07" } },
      }),
    );
  });

  it("calculates revenueShareAmount and finalReceivable correctly", async () => {
    const { calculateStoreSettlementAmounts } = await import(
      "@/server/services/store-settlements"
    );

    expect(calculateStoreSettlementAmounts(input)).toEqual({
      revenueShareAmount: 1000,
      finalReceivable: 12300,
    });
  });

  it("can save a zero-value draft for a no-data month", async () => {
    const { saveStoreSettlementForStore } = await import("@/server/services/store-settlements");

    await saveStoreSettlementForStore({
      storeId: "store-1",
      input: {
        ...input,
        grossRevenue: 0,
        refundAmount: 0,
        netRevenue: 0,
        transactionCount: 0,
        fixedMonthlyFee: 0,
        revenueShareRate: 0,
        additionalAmount: 0,
        deductionAmount: 0,
        note: "",
      },
    });

    expect(mockSettlementUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          grossRevenue: 0,
          finalReceivable: 0,
          note: null,
        }),
      }),
    );
  });

  it("always saves through the DRAFT path instead of confirming via save", async () => {
    const { saveStoreSettlementForStore } = await import("@/server/services/store-settlements");

    await saveStoreSettlementForStore({
      storeId: "store-1",
      input: { ...input, status: "CONFIRMED" },
    });

    expect(mockSettlementUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "DRAFT" }),
        update: expect.objectContaining({ status: "DRAFT" }),
      }),
    );
  });

  it("confirms an existing settlement", async () => {
    const { confirmStoreSettlementForStore } = await import(
      "@/server/services/store-settlements"
    );

    const record = await confirmStoreSettlementForStore({
      storeId: "store-1",
      month: "2026-07",
      userId: "user-1",
    });

    expect(record.status).toBe("CONFIRMED");
    expect(mockSettlementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_store_settlement_store_month: {
            storeId: "store-1",
            month: "2026-07",
          },
        },
        data: { status: "CONFIRMED", updatedBy: "user-1" },
      }),
    );
  });

  it("reopens a confirmed settlement back to DRAFT", async () => {
    const { reopenStoreSettlementForStore } = await import(
      "@/server/services/store-settlements"
    );
    mockSettlementUpdate.mockResolvedValueOnce(settlement({ status: "DRAFT" }));

    const record = await reopenStoreSettlementForStore({
      storeId: "store-1",
      month: "2026-07",
      userId: "user-1",
    });

    expect(record.status).toBe("DRAFT");
    expect(mockSettlementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_store_settlement_store_month: {
            storeId: "store-1",
            month: "2026-07",
          },
        },
        data: { status: "DRAFT", updatedBy: "user-1" },
      }),
    );
  });

  it("allows saving again after a confirmed settlement is reopened", async () => {
    const { reopenStoreSettlementForStore, saveStoreSettlementForStore } = await import(
      "@/server/services/store-settlements"
    );
    mockSettlementUpdate.mockResolvedValueOnce(settlement({ status: "DRAFT" }));
    mockSettlementFindUnique.mockResolvedValueOnce({ status: "DRAFT" });

    await reopenStoreSettlementForStore({
      storeId: "store-1",
      month: "2026-07",
      userId: "user-1",
    });
    await saveStoreSettlementForStore({ storeId: "store-1", userId: "user-1", input });

    expect(mockSettlementUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          fixedMonthlyFee: 3000,
          status: "DRAFT",
        }),
      }),
    );
  });

  it("builds a CSV export with settlement fields and escaped notes", async () => {
    const { buildStoreSettlementCsv } = await import("@/server/services/store-settlements");

    const record = settlement({
      storeName: "測試店",
      note: '含加項, 扣項與 "備註"',
      status: "CONFIRMED",
    }) as Parameters<typeof buildStoreSettlementCsv>[0];
    const csv = buildStoreSettlementCsv(record);

    expect(csv).toContain("店舖名稱,月份,狀態,當月總收款,退款,有效營收");
    expect(csv).toContain("測試店,2026-07,CONFIRMED,12000,2000,10000,5,10,1000,3000,500,200,12300");
    expect(csv).toContain('"含加項, 扣項與 ""備註"""');
  });
});
