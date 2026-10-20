import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  stores: vi.fn(),
  setting: vi.fn(),
  appointments: vi.fn(),
  events: vi.fn(),
  eventUpdate: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: { store: { findMany: m.stores }, $transaction: m.transaction },
}));
vi.mock("@/lib/beauty-db", () => ({
  beautyPrisma: {
    beautySetting: { findUnique: m.setting },
    beautyAppointment: { findMany: m.appointments },
    beautyEvent: { findMany: m.events, updateMany: m.eventUpdate },
  },
}));
vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/server/services/course-card-notification-delivery", () => ({
  deliverCourseCardNotification: m.send,
}));
import { runBeautyNotifications } from "@/server/beauty/notifications";
const now = new Date("2026-10-20T02:00Z");
let tx: {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  customer: { findFirst: ReturnType<typeof vi.fn> };
  messageLog: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BEAUTY_MODULE_ENABLED", "1");
  vi.stubEnv("BEAUTY_NOTIFICATIONS_ENABLED", "1");
  m.stores.mockResolvedValue([{ id: "s", name: "合成" }]);
  m.setting.mockResolvedValue({ notifications: true });
  m.appointments.mockResolvedValue([]);
  m.events.mockResolvedValue([
    {
      id: "event",
      storeId: "s",
      status: "PENDING",
      customerId: "c",
      kind: "BOOKED",
      appointmentId: "b",
      body: "合成通知",
      createdAt: now,
    },
  ]);
  m.send.mockResolvedValue("SENT");
  tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ storeId: "s" }])
      .mockResolvedValueOnce([{ storeId: "s" }])
      .mockResolvedValueOnce([
        { status: "PENDING", customerId: "c", attempts: 0 },
      ])
      .mockResolvedValueOnce([
        { status: "RESERVED", startsAt: new Date("2026-10-21T02:00Z") },
      ]),
    $executeRaw: vi.fn(),
    customer: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: "c",
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
        }),
    },
    messageLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
  };
  m.transaction.mockImplementation((work) => work(tx));
});
afterEach(() => vi.unstubAllEnvs());
it("never touches stores or transport when globally disabled", async () => {
  vi.stubEnv("BEAUTY_NOTIFICATIONS_ENABLED", "");
  expect(await runBeautyNotifications(now)).toEqual({
    sent: 0,
    failed: 0,
    skipped: 0,
  });
  expect(m.stores).not.toHaveBeenCalled();
  expect(m.send).not.toHaveBeenCalled();
});
it("requires store opt-in as well as entitlement", async () => {
  m.setting.mockResolvedValue({ notifications: false });
  await runBeautyNotifications(now);
  expect(m.events).not.toHaveBeenCalled();
  expect(m.send).not.toHaveBeenCalled();
});
it("routes a claimed event only through the shared verified quota transport", async () => {
  expect(await runBeautyNotifications(now)).toMatchObject({ sent: 1 });
  expect(m.send).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      storeId: "s",
      person: expect.objectContaining({ id: "c" }),
      retryKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }),
  );
});
it("a committed SENT receipt suppresses a repeated transport call", async () => {
  tx.messageLog.findUnique.mockResolvedValue({ status: "SENT" });
  await runBeautyNotifications(now);
  expect(m.send).not.toHaveBeenCalled();
});
it("changed or cancelled bookings cannot send an old confirmation", async () => {
  tx.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([{ id: "s" }])
    .mockResolvedValueOnce([{ storeId: "s" }])
    .mockResolvedValueOnce([
      { status: "PENDING", customerId: "c", attempts: 0 },
    ])
    .mockResolvedValueOnce([
      { status: "CANCELLED", startsAt: new Date("2026-10-21T02:00Z") },
    ]);
  await runBeautyNotifications(now);
  expect(m.send).not.toHaveBeenCalled();
});
it("expired retry windows never send a possibly duplicated LINE request", async () => {
  m.events.mockResolvedValue([
    { id: "old", customerId: "c", createdAt: new Date("2026-10-18T02:00Z") },
  ]);
  await runBeautyNotifications(now);
  expect(m.send).not.toHaveBeenCalled();
});
