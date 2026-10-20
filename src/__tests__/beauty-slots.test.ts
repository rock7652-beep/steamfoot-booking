import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/beauty-db", () => ({ beautyPrisma: {} }));
vi.mock("@/server/beauty/access", () => ({ command: vi.fn(), audit: vi.fn() }));
import {
  loadAvailability,
  findAllocation,
  type Tx,
} from "@/server/beauty/booking";
const date = "2099-10-20";
const actor = { storeId: "s", userId: "u", manager: true };
function transaction(interval = 15) {
  const hour = {
    dayOfWeek: new Date(date + "T00:00Z").getUTCDay(),
    isOpen: true,
    openTime: "09:05",
    closeTime: "12:05",
    slotInterval: interval,
    defaultCapacity: 6,
    segments: null,
  };
  return {
    beautyService: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "svc",
          name: "合成",
          duration: 60,
          buffer: 15,
          price: 1000,
          trialPrice: 500,
          active: true,
          revision: 0,
        },
      ]),
    },
    beautyTechnician: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "t",
          gender: "FEMALE",
          sort: 0,
          active: true,
          serviceIds: ["svc"],
          weekly: [{ day: hour.dayOfWeek, start: "09:00", end: "18:00" }],
          exceptions: {},
          rates: { svc: { mode: "FIXED", value: 0 } },
        },
      ]),
    },
    beautyAppointment: { findMany: vi.fn().mockResolvedValue([]) },
    beautySetting: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ leadMinutes: 0, bookableDays: 30 }),
    },
    $queryRaw: vi.fn().mockImplementation((parts: TemplateStringsArray) => {
      const query = parts.join("");
      return Promise.resolve(
        query.includes('"CourseRoom"')
          ? [{ id: "r" }]
          : query.includes('"BusinessHours"')
            ? [hour]
            : query.includes('"SlotOverride"')
              ? [
                  {
                    date: new Date(date + "T00:00Z"),
                    startTime: "09:20",
                    type: "disabled",
                    capacity: null,
                    reason: "暫停",
                  },
                ]
              : [],
      );
    }),
  } as unknown as Tx;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2099-10-19T02:00Z"));
});
afterEach(() => vi.useRealTimers());
it("uses shared opening segments and the store's interval anchor, including disabled slots", async () => {
  const loaded = await loadAvailability(transaction(), actor, date);
  expect(loaded.slots).toContain("09:05");
  expect(loaded.slots).not.toContain("09:20");
  expect(loaded.slots).toContain("09:35");
  const slower = await loadAvailability(transaction(30), actor, date);
  expect(slower.slots).not.toContain("09:50");
  expect(slower.slots).toContain("10:05");
});
it("rejects a forged off-grid start and requires full cleanup before closing", async () => {
  const tx = transaction(),
    loaded = await loadAvailability(tx, actor, date),
    people = [
      { serviceId: "svc", preference: "FEMALE", specifiedTechnicianId: null },
    ] as Parameters<typeof findAllocation>[2]["people"];
  await expect(
    findAllocation(
      tx,
      actor,
      { date, time: "09:07", people },
      [],
      undefined,
      loaded,
    ),
  ).rejects.toThrow("開始時間");
  await expect(
    findAllocation(
      tx,
      actor,
      { date, time: "11:05", people },
      [],
      undefined,
      loaded,
    ),
  ).rejects.toThrow("無法安排");
  expect(
    (
      await findAllocation(
        tx,
        actor,
        { date, time: "10:50", people },
        [],
        undefined,
        loaded,
      )
    ).result[0].occupiedEndsAt.toISOString(),
  ).toBe("2099-10-20T04:05:00.000Z");
});
