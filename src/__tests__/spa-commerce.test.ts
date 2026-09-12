import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({
  permission: vi.fn(),
  store: vi.fn(),
  installation: vi.fn(),
  customer: vi.fn(),
  tx: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  saleFind: vi.fn(),
  saleCreate: vi.fn(),
  pack: vi.fn(),
  treatment: vi.fn(),
  refundFind: vi.fn(),
  refundCreate: vi.fn(),
  receipt: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/server/actions/spa-resources", () => ({
  spaResourceStore: m.store,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    storeModuleInstallation: { findUnique: m.installation },
    customer: { findFirst: m.customer },
  },
}));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { $transaction: m.tx } }));
import {
  purchaseSpaCredit,
  refundSpaPayment,
  voidSpaPayment,
  editSpaPayment,
} from "@/server/actions/spa-commerce";
const topup = {
  customerId: "C",
  kind: "TOPUP" as const,
  amount: 2000,
  paymentMethod: "CASH" as const,
  requestKey: "8d071454-861a-4e2c-84da-7551239e4aef",
};
const stamp = "2026-09-10T00:00:00.000Z";
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ id: "U" });
  m.store.mockResolvedValue("S");
  m.installation.mockResolvedValue({ status: "ACTIVE" });
  m.customer.mockResolvedValue({ id: "C" });
  m.saleFind.mockResolvedValue(null);
  m.refundFind.mockResolvedValue(null);
  m.saleCreate.mockImplementation(async ({ data }) => data);
  m.refundCreate.mockImplementation(async ({ data }) => data);
  m.treatment.mockResolvedValue({ id: "T" });
  m.pack.mockResolvedValue({
    id: "P",
    name: "10次方案",
    treatmentId: "T",
    price: 2000,
    uses: 10,
    validityDays: 30,
    updatedAt: new Date(stamp),
  });
  m.query.mockResolvedValue([{ id: "W", balance: 2000 }]);
  m.tx.mockImplementation(async (fn) =>
    fn({
      $executeRaw: m.execute,
      $queryRaw: m.query,
      spaCreditSale: {
        findUnique: m.saleFind,
        findFirst: m.saleFind,
        create: m.saleCreate,
        update: m.update,
      },
      spaPackage: { findFirst: m.pack },
      spaTreatment: { findFirst: m.treatment },
      spaRefund: { findFirst: m.refundFind, create: m.refundCreate },
      spaReceipt: { findFirst: m.receipt, update: m.update },
    }),
  );
});
describe("SPA purchases", () => {
  it("credits a wallet and records cash collection with its actor", async () => {
    expect((await purchaseSpaCredit(topup)).success).toBe(true);
    expect(m.saleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "S",
        customerId: "C",
        sourceId: "W",
        amount: 2000,
        recordedByUserId: "U",
      }),
    });
    expect(m.query.mock.calls[0].slice(2)).toEqual(["S", "C", 2000]);
  });
  it("returns the same sale on a network retry without crediting again", async () => {
    m.saleFind.mockResolvedValue({
      id: "old",
      fingerprint: JSON.stringify(topup),
    });
    expect(await purchaseSpaCredit(topup)).toEqual({
      success: true,
      saleId: "old",
    });
    expect(m.query).not.toHaveBeenCalled();
    expect(m.saleCreate).not.toHaveBeenCalled();
  });
  it("rejects a reused key with changed amount", async () => {
    m.saleFind.mockResolvedValue({
      id: "old",
      fingerprint: JSON.stringify(topup),
    });
    expect((await purchaseSpaCredit({ ...topup, amount: 3000 })).success).toBe(
      false,
    );
    expect(m.query).not.toHaveBeenCalled();
  });
  it("rejects a foreign customer", async () => {
    m.customer.mockResolvedValue(null);
    expect((await purchaseSpaCredit(topup)).success).toBe(false);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("rejects zero top-up and disabled wallets", async () => {
    expect((await purchaseSpaCredit({ ...topup, amount: 0 })).success).toBe(
      false,
    );
    m.query.mockResolvedValue([]);
    expect((await purchaseSpaCredit(topup)).success).toBe(false);
    expect(m.saleCreate).not.toHaveBeenCalled();
  });
  it("uses server package price, uses and dates, rejecting stale package details", async () => {
    const input = {
      ...topup,
      kind: "PACKAGE" as const,
      packageId: "P",
      expectedPackageUpdatedAt: stamp,
    };
    expect((await purchaseSpaCredit({ ...input, amount: 1 })).success).toBe(
      false,
    );
    expect((await purchaseSpaCredit(input)).success).toBe(true);
    const insert = m.execute.mock.calls.find((c) =>
      c[0].join("").includes('INSERT INTO "SpaEntitlement"'),
    );
    expect(insert?.slice(2, 9)).toEqual([
      "S",
      "C",
      "T",
      "10次方案",
      2000,
      10,
      10,
    ]);
  });
  it("does not report success if recording the sale fails", async () => {
    m.saleCreate.mockRejectedValue(new Error("failure"));
    expect((await purchaseSpaCredit(topup)).success).toBe(false);
  });
  it("requires financial permission before accessing the transaction", async () => {
    m.permission.mockRejectedValue(new Error("denied"));
    expect((await purchaseSpaCredit(topup)).success).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  });
});
describe("SPA refunds", () => {
  it("returns the original refund on retry", async () => {
    m.refundFind.mockResolvedValue({ id: "R" });
    expect(
      await refundSpaPayment({ kind: "SALE", id: "A", reason: "取消" }),
    ).toEqual({ success: true, refundId: "R" });
    expect(m.query).not.toHaveBeenCalled();
  });
  it("denies foreign records and requires a reason", async () => {
    expect(
      (await refundSpaPayment({ kind: "SALE", id: "foreign", reason: "退購" }))
        .success,
    ).toBe(false);
    expect(
      (await refundSpaPayment({ kind: "SALE", id: "A", reason: " " })).success,
    ).toBe(false);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("does not refund a used or reserved package", async () => {
    m.saleFind.mockResolvedValue({
      id: "A",
      customerId: "C",
      kind: "PACKAGE",
      amount: 2000,
      paymentMethod: "CARD",
      sourceId: "E",
    });
    m.query.mockResolvedValue([]);
    expect(
      (await refundSpaPayment({ kind: "SALE", id: "A", reason: "退購" }))
        .success,
    ).toBe(false);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("rejects top-up refund if remaining balance is insufficient", async () => {
    m.saleFind.mockResolvedValue({
      id: "A",
      customerId: "C",
      kind: "TOPUP",
      amount: 2000,
      paymentMethod: "CASH",
      sourceId: "W",
    });
    m.query.mockResolvedValue([]);
    expect(
      (await refundSpaPayment({ kind: "SALE", id: "A", reason: "退購" }))
        .success,
    ).toBe(false);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("restores stored value and preserves the original receipt", async () => {
    m.receipt.mockResolvedValue({
      id: "R",
      bookingId: "B",
      booking: { customerId: "C" },
      amount: 1800,
      paymentMethod: "STORED_VALUE",
      sourceId: "W",
      uses: null,
    });
    expect(
      (await refundSpaPayment({ kind: "RECEIPT", id: "R", reason: "服務退款" }))
        .success,
    ).toBe(true);
    expect(m.refundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        receiptId: "R",
        customerId: "C",
        amount: 1800,
        paymentMethod: "STORED_VALUE",
      }),
    });
  });
  it("does not restore more sessions than were originally deducted", async () => {
    m.receipt.mockResolvedValue({
      id: "R",
      bookingId: "B",
      booking: { customerId: "C" },
      amount: 1800,
      paymentMethod: "ENTITLEMENT",
      sourceId: "E",
      uses: 1,
    });
    m.query
      .mockResolvedValueOnce([{ id: "use", uses: 1 }])
      .mockResolvedValueOnce([]);
    expect(
      (await refundSpaPayment({ kind: "RECEIPT", id: "R", reason: "退次" }))
        .success,
    ).toBe(false);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
});
describe("SPA customer account workspace", () => {
  it("keeps long payment histories scrollable inside the right sheet", () => {
    const workspace = readFileSync(
      "src/app/(dashboard)/dashboard/customers/_components/spa-customers-workspace.tsx",
      "utf8",
    );
    expect(workspace).toContain(
      "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain",
    );
  });
});

it.each(["TRANSFER", "DIGITAL_PAYMENT"] as const)(
  "preserves %s on package and topup sales",
  async (paymentMethod) => {
    const pay = {
      ...topup,
      paymentMethod,
      ...(paymentMethod === "TRANSFER" ? { transferLast4: "0123" } : {}),
    };
    expect((await purchaseSpaCredit(pay)).success).toBe(true);
    expect(
      (
        await purchaseSpaCredit({
          ...pay,
          kind: "PACKAGE",
          packageId: "P",
          expectedPackageUpdatedAt: stamp,
        })
      ).success,
    ).toBe(true);
    expect(m.saleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod,
        ...(paymentMethod === "TRANSFER" ? { transferLast4: "0123" } : {}),
      }),
    });
  },
);
it("rejects missing transfer digits and unexpected non-transfer digits", async () => {
  expect(
    (await purchaseSpaCredit({ ...topup, paymentMethod: "TRANSFER" })).success,
  ).toBe(false);
  expect(
    (await purchaseSpaCredit({ ...topup, transferLast4: "0123" })).success,
  ).toBe(false);
  expect(m.query).not.toHaveBeenCalled();
  expect(m.saleCreate).not.toHaveBeenCalled();
});
it("preserves original transfer digits on receipt refunds without a wallet credit", async () => {
  m.receipt.mockResolvedValue({
    id: "R",
    bookingId: "B",
    booking: { customerId: "C" },
    amount: 1800,
    paymentMethod: "TRANSFER",
    transferLast4: "0123",
    uses: null,
  });
  expect(
    (await refundSpaPayment({ kind: "RECEIPT", id: "R", reason: "服務退款" }))
      .success,
  ).toBe(true);
  expect(m.refundCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      paymentMethod: "TRANSFER",
      transferLast4: "0123",
    }),
  });
  expect(m.query).not.toHaveBeenCalled();
});

describe("SPA revenue corrections", () => {
  const receipt = {
    id: "R",
    storeId: "S",
    bookingId: "B",
    booking: { customerId: "C" },
    amount: 1200,
    paymentMethod: "CASH",
    transferLast4: null,
    uses: null,
  };
  const edit = {
    kind: "RECEIPT" as const,
    id: "R",
    paymentMethod: "TRANSFER" as const,
    transferLast4: "0123",
    expectedMethod: "CASH",
    expectedLast4: null,
    reason: "誤選付款方式",
  };
  it("edits external payment info and journals before/after without changing amount", async () => {
    m.receipt.mockResolvedValue(receipt);
    expect((await editSpaPayment(edit)).success).toBe(true);
    expect(m.permission).toHaveBeenCalledWith("transaction.void");
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "R" },
      data: { paymentMethod: "TRANSFER", transferLast4: "0123" },
    });
    expect(
      m.execute.mock.calls.some((c) =>
        c[0].join("").includes('INSERT INTO "SpaPaymentRevision"'),
      ),
    ).toBe(true);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("rejects stale edits without writing", async () => {
    m.receipt.mockResolvedValue({ ...receipt, paymentMethod: "CARD" });
    expect((await editSpaPayment(edit)).success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects foreign records and malformed transfer reference", async () => {
    m.receipt.mockResolvedValue(null);
    expect((await editSpaPayment(edit)).success).toBe(false);
    expect(
      (await editSpaPayment({ ...edit, transferLast4: "123" })).success,
    ).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects editing refunded payments or converting credit deductions", async () => {
    m.receipt.mockResolvedValue(receipt);
    m.refundFind.mockResolvedValue({ id: "F" });
    expect((await editSpaPayment(edit)).success).toBe(false);
    m.refundFind.mockResolvedValue(null);
    m.receipt.mockResolvedValue({ ...receipt, paymentMethod: "STORED_VALUE" });
    expect((await editSpaPayment(edit)).success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("voids receipt with reversal and a linked journal inside one transaction", async () => {
    m.receipt.mockResolvedValue(receipt);
    expect(
      (await voidSpaPayment({ kind: "RECEIPT", id: "R", reason: "重複登記" }))
        .success,
    ).toBe(true);
    expect(m.refundCreate).toHaveBeenCalledOnce();
    expect(m.refundCreate.mock.calls[0][0].data).toMatchObject({
      receiptId: "R",
      amount: 1200,
      storeId: "S",
    });
    expect(
      m.execute.mock.calls.some((c) => c[0].join("").includes("'VOID'")),
    ).toBe(true);
  });
  it("does not reverse an already refunded payment again", async () => {
    m.refundFind.mockResolvedValue({ id: "F" });
    m.query.mockResolvedValue([]);
    expect(
      (await voidSpaPayment({ kind: "RECEIPT", id: "R", reason: "重複登記" }))
        .success,
    ).toBe(false);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("retries a completed void without another reversal", async () => {
    m.refundFind.mockResolvedValue({ id: "F" });
    m.query.mockResolvedValue([{ id: "V" }]);
    expect(
      (await voidSpaPayment({ kind: "RECEIPT", id: "R", reason: "重複登記" }))
        .success,
    ).toBe(true);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("blocks void if stored value cannot be recovered", async () => {
    m.saleFind.mockResolvedValue({
      id: "SALE",
      storeId: "S",
      customerId: "C",
      kind: "TOPUP",
      sourceId: "W",
      amount: 1000,
      paymentMethod: "CASH",
    });
    m.query.mockResolvedValue([]);
    expect(
      (await voidSpaPayment({ kind: "SALE", id: "SALE", reason: "誤登" }))
        .success,
    ).toBe(false);
    expect(m.refundCreate).not.toHaveBeenCalled();
  });
  it("rejects unauthorized requests before entering a transaction", async () => {
    m.permission.mockRejectedValue(new Error("forbidden"));
    expect((await editSpaPayment(edit)).success).toBe(false);
    expect(
      (await voidSpaPayment({ kind: "RECEIPT", id: "R", reason: "錯帳" }))
        .success,
    ).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  });
});
