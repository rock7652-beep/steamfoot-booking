import { describe, expect, it, vi } from "vitest";
import { lockCashDay } from "@/server/services/cash-day";
import { createFinancialTransaction, lockExistingTransactionCash } from "@/server/services/financial-transaction";
import type { Prisma } from "@prisma/client";

function client(status?: string) {
  return { $queryRaw: vi.fn(async (...args: unknown[]) => { void args; return status ? [{ id: "drawer", status }] : []; }),
    $executeRaw: vi.fn(async (...args: unknown[]) => { void args; return 1; }), transaction: { create: vi.fn(async (args) => args.data) } };
}
const day = new Date("2026-10-06T00:00:00Z");

describe("cash-day write guard", () => {
  it("locks and advances the closing version inside the financial transaction", async () => {
    const tx = client("OPEN");
    await lockCashDay(tx as unknown as Prisma.TransactionClient, "store", day);
    expect((tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain("FOR UPDATE");
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect((tx.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain("GREATEST");
  });
  it("rejects closed cash writes without changing the frozen snapshot", async () => {
    const tx = client("CLOSED");
    await expect(lockCashDay(tx as unknown as Prisma.TransactionClient, "store", day)).rejects.toThrow("結帳");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(await lockCashDay(tx as unknown as Prisma.TransactionClient, "store", day, { allowClosedSupplement: true })).toBe(true);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("preserves optional drawer stores while enforcing existing required-open flows", async () => {
    const tx = client();
    await expect(lockCashDay(tx as unknown as Prisma.TransactionClient, "store", day)).resolves.toBe(false);
    await expect(lockCashDay(tx as unknown as Prisma.TransactionClient, "store", day, { requireOpen: true })).rejects.toThrow("開啟");
  });
  it("uses the cash split rather than the parent method, pinning the Taipei business day", async () => {
    const tx = client("CLOSED");
    const args: Prisma.TransactionCreateArgs = { data: { storeId: "store", customerId: "c", revenueStaffId: "s", amount: 1000,
      transactionType: "PACKAGE_PURCHASE", paymentMethod: "TRANSFER", transactionDate: new Date("2026-10-05T16:01:00Z"),
      paymentSplits: { create: [{ paymentMethod: "CASH", amount: 400 }, { paymentMethod: "TRANSFER", amount: 600 }] } } };
    await expect(createFinancialTransaction(tx as unknown as Prisma.TransactionClient, args)).rejects.toThrow("結帳");
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls[0][2]).toEqual(day);
  });
  it("allows transfer-only and pending payments without changing drawer cash", async () => {
    const tx = client("CLOSED");
    for (const data of [{ paymentMethod: "TRANSFER" }, { paymentMethod: "CASH", paymentStatus: "PENDING" }]) {
      await createFinancialTransaction(tx as unknown as Prisma.TransactionClient, { data: { storeId: "store", customerId: "c", revenueStaffId: "s", amount: 1000, transactionType: "PACKAGE_PURCHASE", ...data } as Prisma.TransactionUncheckedCreateInput });
    }
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.transaction.create).toHaveBeenCalledTimes(2);
  });
});


describe("closed-day transaction cancellation", () => {
  const entry = {
    storeId: "store", transactionDate: day, transactionType: "PACKAGE_PURCHASE",
    paymentMethod: "CASH", paymentStatus: "SUCCESS", status: "SUCCESS", amount: 5990,
  };
  it("permits cancellation while preserving the historical drawer snapshot", async () => {
    const tx = client("CLOSED");
    await expect(lockExistingTransactionCash(tx as unknown as Prisma.TransactionClient, entry,
      undefined, { allowClosedCancellation: true })).resolves.toBeUndefined();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("continues to reject other changes to closed-day cash transactions", async () => {
    const tx = client("CLOSED");
    await expect(lockExistingTransactionCash(tx as unknown as Prisma.TransactionClient, entry)).rejects.toThrow("結帳");
  });
  it("still advances the drawer version when cancelling on an open day", async () => {
    const tx = client("OPEN");
    await lockExistingTransactionCash(tx as unknown as Prisma.TransactionClient, entry,
      undefined, { allowClosedCancellation: true });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
});


it("allows a verified replacement on its closed original day without changing drawer snapshots", async () => {
  const tx = client("CLOSED");
  await createFinancialTransaction(tx as unknown as Prisma.TransactionClient, { data: {
    storeId: "store", customerId: "customer", revenueStaffId: "staff", transactionType: "PACKAGE_PURCHASE",
    paymentMethod: "CASH", amount: 5990, transactionDate: new Date("2026-10-05T16:01:00Z"),
  } }, { allowClosedReplacement: true });
  expect(tx.transaction.create).toHaveBeenCalledOnce();
  expect(tx.$queryRaw.mock.calls[0][2]).toEqual(day);
  expect(tx.$executeRaw).not.toHaveBeenCalled();
});
