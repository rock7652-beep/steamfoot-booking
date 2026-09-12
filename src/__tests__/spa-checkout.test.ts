import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  group: vi.fn(),
  members: vi.fn(),
  permission: vi.fn(),
  store: vi.fn(),
  installation: vi.fn(),
  tx: vi.fn(),
  booking: vi.fn(),
  receipt: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  prior: vi.fn(),
  deduct: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/server/actions/spa-resources", () => ({
  spaResourceStore: m.store,
}));
vi.mock("@/lib/db", () => ({
  prisma: { storeModuleInstallation: { findUnique: m.installation } },
}));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { $transaction: m.tx } }));
vi.mock("@/server/spa-checkout-credit", () => ({
  assertNoPriorSpaSettlement: m.prior,
  deductSpaCredit: m.deduct,
  readSpaCreditOptions: vi.fn(),
}));
import {
  completeSpaBookingGroup,
  completeSpaBooking,
} from "@/server/actions/spa-checkout";
const date = new Date("2026-09-10T01:00:00.000Z"),
  input = {
    bookingId: "B",
    expectedUpdatedAt: date.toISOString(),
    expectedAmount: 1800,
    paymentMethod: "CASH" as const,
  };
beforeEach(() => {
  vi.clearAllMocks();
  m.group.mockResolvedValue({ id: "G", customerId: "C" });
  m.members.mockResolvedValue([
    { id: "B", customerId: "C", status: "CONFIRMED" },
    { id: "B2", customerId: "C", status: "CONFIRMED" },
  ]);
  m.prior.mockResolvedValue(undefined);
  m.deduct.mockResolvedValue({ balanceAfter: 200, uses: null });
  m.permission.mockResolvedValue({ id: "owner" });
  m.store.mockResolvedValue("test");
  m.installation.mockResolvedValue({ status: "ACTIVE" });
  m.booking.mockResolvedValue({
    id: "B",
    status: "CONFIRMED",
    totalPriceSnapshot: 1800,
    updatedAt: date,
  });
  m.receipt.mockResolvedValue(null);
  m.create.mockResolvedValue({ id: "R" });
  m.tx.mockImplementation(async (fn) =>
    fn({
      $executeRaw: vi.fn(),
      spaBookingGroup: { findFirst: m.group },
      spaBooking: {
        findMany: m.members,
        findFirst: m.booking,
        update: m.update,
      },
      spaReceipt: { findUnique: m.receipt, create: m.create },
    }),
  );
});
describe("isolated SPA checkout", () => {
  it("records the stored amount and completes in one transaction", async () => {
    expect(await completeSpaBooking(input)).toEqual({
      success: true,
      receiptId: "R",
    });
    expect(m.permission).toHaveBeenCalledWith("transaction.create");
    expect(m.store).toHaveBeenCalledWith("booking.update");
    expect(m.create).toHaveBeenCalledWith({
      data: {
        storeId: "test",
        bookingId: "B",
        amount: 1800,
        paymentMethod: "CASH",
        recordedByUserId: "owner",
      },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id_storeId: { id: "B", storeId: "test" } },
      data: { status: "COMPLETED" },
    });
  });
  it("returns the original receipt on an identical retry", async () => {
    m.booking.mockResolvedValue({ id: "B", status: "COMPLETED" });
    m.receipt.mockResolvedValue({
      id: "R",
      amount: 1800,
      paymentMethod: "CASH",
    });
    expect((await completeSpaBooking(input)).success).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not change an existing payment method", async () => {
    m.booking.mockResolvedValue({ id: "B", status: "COMPLETED" });
    m.receipt.mockResolvedValue({
      id: "R",
      amount: 1800,
      paymentMethod: "CARD",
    });
    expect((await completeSpaBooking(input)).success).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each(["CANCELLED", "NO_SHOW", "COMPLETED"])(
    "rejects %s without inserting a receipt",
    async (status) => {
      m.booking.mockResolvedValue({
        id: "B",
        status,
        totalPriceSnapshot: 1800,
        updatedAt: date,
      });
      expect((await completeSpaBooking(input)).success).toBe(false);
      expect(m.create).not.toHaveBeenCalled();
    },
  );
  it("rejects stale amount and stale version", async () => {
    expect(
      (await completeSpaBooking({ ...input, expectedAmount: 1 })).success,
    ).toBe(false);
    expect(
      (
        await completeSpaBooking({
          ...input,
          expectedUpdatedAt: "2026-09-09T00:00:00.000Z",
        })
      ).success,
    ).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("scopes lookup to the authorized store", async () => {
    m.booking.mockResolvedValue(null);
    expect((await completeSpaBooking(input)).success).toBe(false);
    expect(m.booking).toHaveBeenCalledWith({
      where: { id: "B", storeId: "test" },
    });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("denies missing permission before any transaction", async () => {
    m.permission.mockRejectedValue(new Error("denied"));
    expect((await completeSpaBooking(input)).success).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("does not report success when completion fails after receipt insertion", async () => {
    m.update.mockRejectedValueOnce(new Error("failure"));
    expect((await completeSpaBooking(input)).success).toBe(false);
  });
});

it("deducts credit and records the source in the same checkout", async () => {
  const r = await completeSpaBooking({
    ...input,
    paymentMethod: "STORED_VALUE",
    sourceId: "W",
  });
  expect(r.success).toBe(true);
  expect(m.deduct).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ id: "B" }),
    "STORED_VALUE",
    "W",
    1800,
  );
  expect(m.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      sourceId: "W",
      balanceAfter: 200,
      paymentMethod: "STORED_VALUE",
    }),
  });
});
it("rejects missing credit source and unexpected cash source", async () => {
  expect(
    (await completeSpaBooking({ ...input, paymentMethod: "ENTITLEMENT" }))
      .success,
  ).toBe(false);
  expect((await completeSpaBooking({ ...input, sourceId: "W" })).success).toBe(
    false,
  );
  expect(m.create).not.toHaveBeenCalled();
});
it("rejects a retry against a different credit source", async () => {
  m.booking.mockResolvedValue({ id: "B", status: "COMPLETED" });
  m.receipt.mockResolvedValue({
    id: "R",
    amount: 1800,
    paymentMethod: "ENTITLEMENT",
    sourceId: "E1",
  });
  expect(
    (
      await completeSpaBooking({
        ...input,
        paymentMethod: "ENTITLEMENT",
        sourceId: "E2",
      })
    ).success,
  ).toBe(false);
  expect(m.deduct).not.toHaveBeenCalled();
});
it("blocks pre-existing ledger settlement before receipt insertion", async () => {
  m.prior.mockRejectedValueOnce(new Error("already settled"));
  expect((await completeSpaBooking(input)).success).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
});
it("does not create a receipt or complete when debit fails", async () => {
  m.deduct.mockRejectedValueOnce(new Error("insufficient"));
  expect(
    (
      await completeSpaBooking({
        ...input,
        paymentMethod: "STORED_VALUE",
        sourceId: "W",
      })
    ).success,
  ).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
});

it("settles all unpaid group members in one transaction", async () => {
  expect(
    (
      await completeSpaBookingGroup({
        groupId: "G",
        bookings: [input, { ...input, bookingId: "B2" }],
      })
    ).success,
  ).toBe(true);
  expect(m.tx).toHaveBeenCalledOnce();
  expect(m.create).toHaveBeenCalledTimes(2);
});
it("rejects omitted unpaid members and foreign booking ids", async () => {
  expect(
    (await completeSpaBookingGroup({ groupId: "G", bookings: [input] }))
      .success,
  ).toBe(false);
  expect(
    (
      await completeSpaBookingGroup({
        groupId: "G",
        bookings: [input, { ...input, bookingId: "foreign" }],
      })
    ).success,
  ).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
});
it("rejects mixed and credit methods for an entire group", async () => {
  expect(
    (
      await completeSpaBookingGroup({
        groupId: "G",
        bookings: [input, { ...input, bookingId: "B2", paymentMethod: "CARD" }],
      })
    ).success,
  ).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
});
it("does not report group success when a later member fails", async () => {
  m.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("failed"));
  expect(
    (
      await completeSpaBookingGroup({
        groupId: "G",
        bookings: [input, { ...input, bookingId: "B2" }],
      })
    ).success,
  ).toBe(false);
  expect(m.tx).toHaveBeenCalledOnce();
});

it.each(["TRANSFER", "DIGITAL_PAYMENT"] as const)(
  "records %s without deducting customer credit",
  async (paymentMethod) => {
    const transfer =
      paymentMethod === "TRANSFER" ? { transferLast4: "0123" } : {};
    expect(
      (await completeSpaBooking({ ...input, paymentMethod, ...transfer }))
        .success,
    ).toBe(true);
    expect(m.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentMethod, ...transfer }),
    });
    expect(m.deduct).not.toHaveBeenCalled();
  },
);
it.each([undefined, "123", "12345", "12ab"])(
  "rejects invalid transfer reference %s before transaction",
  async (transferLast4) => {
    expect(
      (
        await completeSpaBooking({
          ...input,
          paymentMethod: "TRANSFER",
          transferLast4,
        })
      ).success,
    ).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  },
);
it("rejects changed transfer reference on a receipt retry", async () => {
  m.booking.mockResolvedValue({ id: "B", status: "COMPLETED" });
  m.receipt.mockResolvedValue({
    id: "R",
    amount: 1800,
    paymentMethod: "TRANSFER",
    transferLast4: "0123",
  });
  expect(
    (
      await completeSpaBooking({
        ...input,
        paymentMethod: "TRANSFER",
        transferLast4: "0123",
      })
    ).success,
  ).toBe(true);
  expect(
    (
      await completeSpaBooking({
        ...input,
        paymentMethod: "TRANSFER",
        transferLast4: "9999",
      })
    ).success,
  ).toBe(false);
  expect(m.create).not.toHaveBeenCalled();
});
it.each(["TRANSFER", "DIGITAL_PAYMENT"] as const)(
  "supports %s group collection",
  async (paymentMethod) => {
    const pay = {
      ...input,
      paymentMethod,
      ...(paymentMethod === "TRANSFER" ? { transferLast4: "0123" } : {}),
    };
    expect(
      (
        await completeSpaBookingGroup({
          groupId: "G",
          bookings: [pay, { ...pay, bookingId: "B2" }],
        })
      ).success,
    ).toBe(true);
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.deduct).not.toHaveBeenCalled();
  },
);
