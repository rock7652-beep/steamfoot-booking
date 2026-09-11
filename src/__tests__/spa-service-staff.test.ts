import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  store: vi.fn(),
  tx: vi.fn(),
  staffFind: vi.fn(),
  staffList: vi.fn(),
  staffCount: vi.fn(),
  treatments: vi.fn(),
  links: vi.fn(),
  regular: vi.fn(),
  exceptions: vi.fn(),
  bookings: vi.fn(),
  locations: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/actions/spa-resources", () => ({
  spaResourceStore: m.store,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    staff: {
      findFirst: m.staffFind,
      findMany: m.staffList,
      count: m.staffCount,
    },
  },
}));
vi.mock("@/lib/spa-db", () => ({
  spaPrisma: {
    $transaction: m.tx,
    spaTreatment: { findMany: m.treatments },
    spaStaffSkill: { findMany: m.links },
    spaStaffAvailability: { findMany: m.regular },
    spaStaffAvailabilityException: { findMany: m.exceptions },
    spaBooking: { findMany: m.bookings },
    spaServiceLocation: { findMany: m.locations },
  },
}));
import {
  getSpaAvailableProviders,
  saveSpaPersonServices,
  saveSpaServiceProviders,
  saveSpaServiceDetails,
} from "@/server/actions/spa-service-staff";
beforeEach(() => {
  vi.clearAllMocks();
  m.store.mockResolvedValue("store");
  m.locations.mockResolvedValue([{ id: "L", name: "位置" }]);
  m.staffFind.mockResolvedValue({ id: "A" });
  m.staffList.mockResolvedValue([
    { id: "A", displayName: "甲" },
    { id: "B", displayName: "乙" },
  ]);
});
describe("service-provider relation", () => {
  it("removing one person's service preserves other providers and other services", async () => {
    const create = vi.fn(),
      remove = vi.fn();
    m.tx.mockImplementation(async (fn) =>
      fn({
        $executeRaw: vi.fn(),
        spaTreatment: {
          findMany: vi.fn().mockResolvedValue([
            { id: "T1", skills: [{ skillId: "shared" }] },
            { id: "T2", skills: [{ skillId: "shared" }] },
          ]),
        },
        spaStaffSkill: {
          findMany: vi.fn().mockResolvedValue([
            { staffId: "A", skillId: "shared" },
            { staffId: "B", skillId: "shared" },
          ]),
          deleteMany: vi.fn(),
          createMany: create,
        },
        spaSkill: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn(),
        },
        spaTreatmentSkill: { deleteMany: remove, create: vi.fn() },
      }),
    );
    expect(
      (await saveSpaPersonServices({ staffId: "A", treatmentIds: ["T2"] }))
        .success,
    ).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({
      where: { storeId: "store", treatmentId: "T1" },
    });
    expect(create).toHaveBeenCalledWith({
      data: [{ storeId: "store", staffId: "B", skillId: "spa-service:T1" }],
    });
  });
  it("rejects a provider outside the authorized store", async () => {
    const write = vi.fn();
    m.staffCount.mockResolvedValue(0);
    m.tx.mockImplementation(async (fn) =>
      fn({
        $executeRaw: vi.fn(),
        spaTreatment: { findFirst: vi.fn().mockResolvedValue({ id: "T1" }) },
        spaSkill: { upsert: write },
      }),
    );
    expect(
      (
        await saveSpaServiceProviders({
          treatmentId: "T1",
          staffIds: ["other-store-person"],
        })
      ).success,
    ).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it("requires all services, excludes breaks and excludes existing bookings", async () => {
    m.staffList.mockResolvedValue(
      ["A", "B", "C", "D"].map((id) => ({ id, displayName: id })),
    );
    m.treatments.mockResolvedValue([
      {
        id: "T1",
        serviceMinutes: 30,
        bufferMinutes: 0,
        serviceLocations: [{ serviceLocationId: "L" }],
        skills: [{ skillId: "S1" }],
      },
      {
        id: "T2",
        serviceMinutes: 30,
        bufferMinutes: 0,
        serviceLocations: [{ serviceLocationId: "L" }],
        skills: [{ skillId: "S2" }],
      },
    ]);
    m.links.mockResolvedValue(
      ["A", "B", "C", "D"].flatMap((staffId) =>
        (staffId === "B" ? ["S1"] : ["S1", "S2"]).map((skillId) => ({
          staffId,
          skillId,
        })),
      ),
    );
    m.regular.mockResolvedValue(
      ["A", "B", "C", "D"].map((staffId) => ({
        staffId,
        startTime: "09:00",
        endTime: "18:00",
        isActive: true,
      })),
    );
    m.exceptions.mockResolvedValue([
      {
        staffId: "C",
        type: "UNAVAILABLE",
        startTime: "12:00",
        endTime: "13:00",
      },
    ]);
    m.bookings.mockResolvedValue([
      { serviceStaffId: "D", startTime: "12:00", endTime: "13:00" },
    ]);
    const result = await getSpaAvailableProviders({
      date: "2026-09-11",
      startTime: "12:00",
      treatmentIds: ["T1", "T2"],
    });
    expect(result).toMatchObject({
      success: true,
      people: [{ id: "A", name: "A" }],
      reason: "",
      suggestions: [],
    });
  });
});

it("suggests only complete service intervals after a break and existing booking", async () => {
  m.staffList.mockResolvedValue([{ id: "A", displayName: "甲" }]);
  m.treatments.mockResolvedValue([
    {
      id: "T",
      serviceMinutes: 45,
      bufferMinutes: 15,
      serviceLocations: [{ serviceLocationId: "L" }],
      skills: [],
    },
  ]);
  m.links.mockResolvedValue([]);
  m.regular.mockResolvedValue([
    { staffId: "A", startTime: "09:00", endTime: "16:00", isActive: true },
  ]);
  m.exceptions.mockResolvedValue([
    { staffId: "A", type: "UNAVAILABLE", startTime: "12:00", endTime: "13:00" },
  ]);
  m.bookings.mockResolvedValue([
    { serviceStaffId: "A", startTime: "13:00", endTime: "14:00" },
  ]);
  const r = await getSpaAvailableProviders({
    date: "2026-09-11",
    startTime: "12:00",
    treatmentIds: ["T"],
  });
  expect(r.success).toBe(true);
  if (!r.success) return;
  expect(r.reason).toContain("休息");
  expect(r.people).toEqual([]);
  expect(r.suggestions[0]).toEqual({ startTime: "14:00", endTime: "15:00" });
  expect(r.suggestions.every((s) => s.endTime <= "16:00")).toBe(true);
});
it("rejects a foreign location before changing any service fields", async () => {
  const update = vi.fn();
  m.staffCount.mockResolvedValue(1);
  m.tx.mockImplementation(async (fn) =>
    fn({
      $executeRaw: vi.fn(),
      spaTreatment: {
        findFirst: vi.fn().mockResolvedValue({ id: "T" }),
        update,
      },
      spaServiceLocation: { count: vi.fn().mockResolvedValue(0) },
    }),
  );
  const r = await saveSpaServiceDetails({
    id: "T",
    baseName: "美容",
    variantLabel: "",
    price: 500,
    serviceMinutes: 60,
    bufferMinutes: 0,
    isActive: true,
    publicVisible: false,
    staffIds: ["A"],
    locationIds: ["foreign"],
  });
  expect(r.success).toBe(false);
  expect(update).not.toHaveBeenCalled();
});

describe("joint staff and location availability", () => {
  beforeEach(() => {
    m.staffList.mockResolvedValue([{ id: "A", displayName: "甲" }]);
    m.treatments.mockResolvedValue([
      {
        id: "T",
        serviceMinutes: 60,
        bufferMinutes: 0,
        skills: [],
        serviceLocations: [{ serviceLocationId: "L" }],
      },
    ]);
    m.links.mockResolvedValue([]);
    m.regular.mockResolvedValue([
      { staffId: "A", startTime: "09:00", endTime: "18:00", isActive: true },
    ]);
    m.exceptions.mockResolvedValue([]);
  });
  it("excludes a fully occupied location despite an available staff member and suggests after release", async () => {
    m.bookings.mockResolvedValue([
      {
        serviceStaffId: "OTHER",
        serviceLocationId: "L",
        startTime: "12:00",
        endTime: "14:00",
      },
    ]);
    const r = await getSpaAvailableProviders({
      date: "2026-09-11",
      startTime: "12:00",
      treatmentIds: ["T"],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.people).toEqual([]);
    expect(r.locations).toEqual([]);
    expect(r.reason).toContain("位置");
    expect(r.suggestions[0]).toEqual({ startTime: "14:00", endTime: "15:00" });
  });
  it("requires a common location across all selected services", async () => {
    m.treatments.mockResolvedValue([
      {
        id: "T",
        serviceMinutes: 30,
        bufferMinutes: 0,
        skills: [],
        serviceLocations: [{ serviceLocationId: "L" }],
      },
      {
        id: "T2",
        serviceMinutes: 30,
        bufferMinutes: 0,
        skills: [],
        serviceLocations: [{ serviceLocationId: "L2" }],
      },
    ]);
    m.locations.mockResolvedValue([
      { id: "L", name: "一" },
      { id: "L2", name: "二" },
    ]);
    m.bookings.mockResolvedValue([]);
    const r = await getSpaAvailableProviders({
      date: "2026-09-11",
      startTime: "12:00",
      treatmentIds: ["T", "T2"],
    });
    expect(r).toMatchObject({
      success: true,
      people: [],
      locations: [],
      suggestions: [],
      setupHref: "/dashboard/spa-resources",
    });
  });
  it("returns only free locations and excludes the edited booking in the scoped query", async () => {
    m.treatments.mockResolvedValue([
      {
        id: "T",
        serviceMinutes: 60,
        bufferMinutes: 0,
        skills: [],
        serviceLocations: [
          { serviceLocationId: "L" },
          { serviceLocationId: "L2" },
        ],
      },
    ]);
    m.locations.mockResolvedValue([
      { id: "L", name: "一" },
      { id: "L2", name: "二" },
    ]);
    m.bookings.mockResolvedValue([
      {
        serviceStaffId: "OTHER",
        serviceLocationId: "L",
        startTime: "12:00",
        endTime: "13:00",
      },
    ]);
    const r = await getSpaAvailableProviders({
      date: "2026-09-11",
      startTime: "12:00",
      treatmentIds: ["T"],
      bookingId: "editing",
    });
    expect(r).toMatchObject({
      success: true,
      people: [{ id: "A", name: "甲" }],
      locations: [{ id: "L2", name: "二" }],
    });
    expect(m.bookings).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store",
          id: { not: "editing" },
          status: { in: ["PENDING", "CONFIRMED"] },
        }),
      }),
    );
  });
});

it("creates an isolated service with its own provider and location relations", async () => {
  const create = vi.fn().mockResolvedValue({ id: "NEW" }),
    provider = vi.fn(),
    location = vi.fn();
  m.staffCount.mockResolvedValue(1);
  m.tx.mockImplementation(async (fn) =>
    fn({
      $executeRaw: vi.fn(),
      spaTreatment: { create },
      spaServiceLocation: { count: vi.fn().mockResolvedValue(1) },
      spaSkill: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      spaTreatmentSkill: { deleteMany: vi.fn(), create: vi.fn() },
      spaStaffSkill: { deleteMany: vi.fn(), createMany: provider },
      spaTreatmentServiceLocation: {
        deleteMany: vi.fn(),
        createMany: location,
      },
    }),
  );
  const result = await saveSpaServiceDetails({
    baseName: "美甲",
    variantLabel: "",
    price: 800,
    serviceMinutes: 60,
    bufferMinutes: 15,
    isActive: true,
    publicVisible: false,
    staffIds: ["A"],
    locationIds: ["L"],
  });
  expect(result.success).toBe(true);
  expect(create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      storeId: "store",
      name: "美甲",
      price: 800,
    }),
  });
  expect(provider).toHaveBeenCalledWith({
    data: [{ storeId: "store", staffId: "A", skillId: "spa-service:NEW" }],
  });
  expect(location).toHaveBeenCalledWith({
    data: [{ storeId: "store", treatmentId: "NEW", serviceLocationId: "L" }],
  });
});
it("rejects foreign providers before creating a service", async () => {
  const create = vi.fn();
  m.staffCount.mockResolvedValue(0);
  m.tx.mockImplementation(async (fn) =>
    fn({ $executeRaw: vi.fn(), spaTreatment: { create } }),
  );
  expect(
    (
      await saveSpaServiceDetails({
        baseName: "美甲",
        variantLabel: "",
        price: 800,
        serviceMinutes: 60,
        bufferMinutes: 0,
        isActive: true,
        publicVisible: false,
        staffIds: ["foreign"],
        locationIds: [],
      })
    ).success,
  ).toBe(false);
  expect(create).not.toHaveBeenCalled();
});
