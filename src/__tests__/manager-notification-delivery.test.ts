import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const h = vi.hoisted(() => ({
  store: vi.fn(),
  claim: vi.fn(),
  staff: vi.fn(),
  scope: vi.fn(),
  recipients: vi.fn(),
  current: vi.fn(),
  existing: vi.fn(),
  upsert: vi.fn(),
  createRecipient: vi.fn(),
  updateRecipient: vi.fn(),
  createLog: vi.fn(),
  findLog: vi.fn(),
  updateLog: vi.fn(),
  claimLog: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/line", () => ({ pushMessage: h.push }));
vi.mock("@/lib/db", () => {
  const tx = {
    store: { findUnique: h.store, updateMany: h.claim },
    staff: { findMany: h.staff, findFirst: h.scope },
    storeLineNotificationRecipient: {
      findMany: h.recipients,
      findFirst: h.current,
      findUnique: h.existing,
      upsert: h.upsert,
      create: h.createRecipient,
      update: h.updateRecipient,
    },
    managerNotificationLog: {
      create: h.createLog,
      findUnique: h.findLog,
      update: h.updateLog,
      updateMany: h.claimLog,
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});
import {
  deliverManagerNotification,
  migrateManagerRecipients,
} from "@/server/services/manager-notification-delivery";
import { managerPreferences } from "@/lib/manager-notification-preferences";

const recipient = (id = "a", changes = {}) => ({
  id,
  lineUserId: `line-${id}`,
  displayName: id,
  sameDayBookingEnabled: false,
  preferences: {},
  isActive: true,
  ...changes,
});
const event = {
  storeId: "store-a",
  eventKey: "booking-created:1",
  type: "PUBLIC_TRIAL_BOOKING_CREATED",
  messages: [{ type: "text" as const, text: "預約通知" }],
};
const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "6",
  });

describe("manager delivery preferences and durable deduplication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    h.store.mockResolvedValue({
      managerRecipientsMigrated: true,
      slug: "test-store",
    });
    h.recipients.mockResolvedValue([recipient()]);
    h.current.mockImplementation(async ({ where }) => recipient(where.id));
    h.createLog.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: new Date(),
    }));
    h.updateLog.mockResolvedValue({});
    h.push.mockResolvedValue({ success: true });
  });
  it("preserves old defaults and requires opt-in for same-day and newly scheduled incomplete reminders", () => {
    expect(managerPreferences({})).toMatchObject({
      sameDay: false,
      incomplete: false,
      trial: true,
      vip: true,
    });
    expect(
      managerPreferences({ trial: false, sameDay: true }, false).trial,
    ).toBe(false);
    expect(managerPreferences({ sameDay: true }, false).sameDay).toBe(false);
  });
  it("honors a master switch turned off after recipient selection", async () => {
    h.current.mockResolvedValue(null);
    await deliverManagerNotification(event);
    expect(h.push).not.toHaveBeenCalled();
    expect(h.current).toHaveBeenCalledWith({
      where: { id: "a", storeId: "store-a", isActive: true },
    });
  });
  it("does not fall back to environment or staff after migration when all recipients are paused", async () => {
    h.recipients.mockResolvedValue([]);
    await deliverManagerNotification(event);
    expect(h.staff).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });
  it("keeps each recipient's preference independent", async () => {
    h.recipients.mockResolvedValue([
      recipient("a", { preferences: { trial: false } }),
      recipient("b"),
    ]);
    await deliverManagerNotification(event);
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(h.push).toHaveBeenCalledWith(
      "store-a",
      "line-b",
      event.messages,
      expect.any(String),
    );
  });
  it.each([
    [true, true, 1],
    [true, false, 1],
    [false, true, 1],
    [false, false, 0],
  ])(
    "same-day trial OR policy (%s, %s) sends once",
    async (trial, sameDay, count) => {
      const r = recipient("a", {
        preferences: { trial },
        sameDayBookingEnabled: sameDay,
      });
      h.recipients.mockResolvedValue([r]);
      h.current.mockResolvedValue(r);
      await deliverManagerNotification({ ...event, sameDayTrial: true });
      expect(h.push).toHaveBeenCalledTimes(count as number);
    },
  );
  it("does not use same-day opt-in for future trial bookings", async () => {
    h.recipients.mockResolvedValue([
      recipient("a", {
        preferences: { trial: false },
        sameDayBookingEnabled: true,
      }),
    ]);
    await deliverManagerNotification({ ...event, sameDayTrial: false });
    expect(h.push).not.toHaveBeenCalled();
  });
  it("only the database claim winner sends concurrent duplicate events", async () => {
    h.createLog.mockRejectedValueOnce(duplicate());
    h.findLog.mockResolvedValue({ status: "PENDING" });
    await Promise.all([
      deliverManagerNotification(event),
      deliverManagerNotification(event),
    ]);
    expect(h.push).toHaveBeenCalledTimes(1);
  });
  it("treats an already sent event as complete without sending again", async () => {
    h.createLog.mockRejectedValue(duplicate());
    h.findLog.mockResolvedValue({ status: "SENT" });
    expect(await deliverManagerNotification(event)).toMatchObject({
      status: "sent",
      sentCount: 1,
    });
    expect(h.push).not.toHaveBeenCalled();
  });
  it("retries with the saved body and original LINE retry key", async () => {
    h.createLog.mockRejectedValue(duplicate());
    h.findLog.mockResolvedValue({
      id: "retry-uuid",
      status: "FAILED",
      createdAt: new Date(),
      renderedBody: "original",
    });
    h.claimLog.mockResolvedValue({ count: 1 });
    await deliverManagerNotification(event);
    expect(h.push).toHaveBeenCalledWith(
      "store-a",
      "line-a",
      [{ type: "text", text: "original" }],
      "retry-uuid",
    );
  });
  it("does not retry beyond LINE's deduplication window", async () => {
    h.createLog.mockRejectedValue(duplicate());
    h.findLog.mockResolvedValue({
      status: "FAILED",
      createdAt: new Date(Date.now() - 24 * 3600000),
    });
    await deliverManagerNotification(event);
    expect(h.push).not.toHaveBeenCalled();
  });
  it("isolates recipient failures and records both outcomes", async () => {
    h.recipients.mockResolvedValue([recipient("a"), recipient("b")]);
    h.push.mockResolvedValueOnce({ success: false, error: "LINE API 400" });
    expect(await deliverManagerNotification(event)).toMatchObject({
      sentCount: 1,
      failedCount: 1,
    });
    expect(h.updateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(h.updateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT" }),
      }),
    );
  });
  it("preserves legacy VIP owner/assigned-staff scope", async () => {
    h.recipients.mockResolvedValue([
      recipient("a", { legacyStaffId: "staff-a" }),
    ]);
    h.scope.mockResolvedValue(null);
    await deliverManagerNotification({
      ...event,
      type: "VIP_INTEREST",
      assignedStaffId: "staff-b",
    });
    expect(h.scope).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "staff-a",
          storeId: "store-a",
          status: "ACTIVE",
          OR: [{ isOwner: true }, { id: "staff-b" }],
        },
      }),
    );
    expect(h.push).not.toHaveBeenCalled();
  });
  it("unknown event types fail closed", async () => {
    expect(
      await deliverManagerNotification({ ...event, type: "unknown" }),
    ).toMatchObject({ status: "failed" });
    expect(h.push).not.toHaveBeenCalled();
  });
});

describe("legacy migration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    h.store.mockResolvedValue({
      managerRecipientsMigrated: false,
      slug: "test-store",
    });
    h.claim.mockResolvedValue({ count: 1 });
    h.staff.mockResolvedValue([]);
  });
  it("never overwrites or reactivates an existing paused environment recipient", async () => {
    vi.stubEnv("LINE_MANAGER_USER_ID_TEST_STORE", "legacy");
    h.existing.mockResolvedValue(recipient("a", { isActive: false }));
    await migrateManagerRecipients("store-a");
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
    expect(h.updateRecipient).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("imports staff with only VIP enabled and preserves their assigned scope", async () => {
    h.staff.mockResolvedValue([
      {
        id: "staff-a",
        displayName: "A",
        user: { accounts: [{ providerAccountId: "line-a" }] },
      },
    ]);
    h.existing.mockResolvedValue(null);
    await migrateManagerRecipients("store-a");
    expect(h.createRecipient).toHaveBeenCalledWith({
      data: expect.objectContaining({
        legacyStaffId: "staff-a",
        preferences: {
          trial: false,
          vip: true,
          lead: false,
          support: false,
          payment: false,
          incomplete: false,
          digest: false,
        },
      }),
    });
  });
  it("a concurrent migration cannot import recipients twice", async () => {
    h.claim.mockResolvedValue({ count: 0 });
    await migrateManagerRecipients("store-a");
    expect(h.staff).not.toHaveBeenCalled();
  });
});
