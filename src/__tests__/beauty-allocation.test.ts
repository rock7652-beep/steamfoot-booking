import { describe, it, expect } from "vitest";
import {
  allocateParty,
  serviceFee,
  type Technician,
  type Service,
} from "@/lib/beauty/allocation";
import {
  partyInput,
  technicianInput,
  planInput,
  rate,
} from "@/lib/beauty/contracts";
const date = "2099-10-20",
  start = new Date(date + "T10:00:00+08:00");
const face: Service = {
  id: "face",
  name: "做臉",
  duration: 60,
  buffer: 15,
  active: true,
  price: 1000,
  trialPrice: 500,
};
const massage: Service = {
  ...face,
  id: "massage",
  name: "按摩",
  duration: 90,
  buffer: 0,
};
function tech(
  id: string,
  gender = "FEMALE",
  serviceIds = ["face", "massage"],
  sort = 0,
): Technician {
  return {
    id,
    gender,
    serviceIds,
    sort,
    active: true,
    weekly: Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "09:00",
      end: "20:00",
    })),
    exceptions: {},
    rates: {
      face: { mode: "FIXED", value: 300 },
      massage: { mode: "PERCENT", value: 50, base: "PAID" },
    },
  };
}
const person = (
  serviceId = "face",
  preference: "FEMALE" | "MALE" | "ANY" = "ANY",
  specifiedTechnicianId: string | null = null,
) => ({ serviceId, preference, specifiedTechnicianId });
function allocate(override: Partial<Parameters<typeof allocateParty>[0]> = {}) {
  return allocateParty({
    date,
    startsAt: start,
    services: [face, massage],
    technicians: [tech("a"), tech("b", "MALE")],
    people: [person()],
    locationIds: ["r1", "r2"],
    occupied: [],
    hours: [{ start: "09:00", end: "20:00" }],
    ...override,
  });
}
describe("beauty whole-party allocation", () => {
  it("reserves differing service ends and post-service buffers", () => {
    const r = allocate({ people: [person("face"), person("massage")] })!;
    expect(r).toHaveLength(2);
    expect(+r[0].endsAt - +start).toBe(60 * 60000);
    expect(+r[0].occupiedEndsAt - +start).toBe(75 * 60000);
    expect(+r[1].endsAt - +start).toBe(90 * 60000);
    expect(new Set(r.map((x) => x.technicianId)).size).toBe(2);
    expect(new Set(r.map((x) => x.locationId)).size).toBe(2);
  });
  it("backtracks so the only facial specialist is not lost to massage", () => {
    const r = allocate({
      people: [person("massage"), person("face")],
      technicians: [tech("a"), tech("b", "FEMALE", ["massage"])],
    })!;
    expect(r.map((x) => x.technicianId)).toEqual(["b", "a"]);
  });
  it("never falls back to another gender", () =>
    expect(
      allocate({ people: [person("face", "MALE")], technicians: [tech("a")] }),
    ).toBeNull());
  it("honours an explicit technician and rejects gender mismatch", () => {
    expect(allocate({ people: [person("face", "FEMALE", "b")] })).toBeNull();
    expect(
      allocate({ people: [person("face", "ANY", "b")] })![0].technicianId,
    ).toBe("b");
  });
  it("uses total daily minutes, not appointment count", () => {
    const occupied = [
      {
        start: +start - 3 * 3600000,
        end: +start - 2 * 3600000,
        technicianId: "a",
        locationId: "r1",
        duration: 90,
        status: "COMPLETED",
      },
      {
        start: +start - 3 * 3600000,
        end: +start - 2 * 3600000,
        technicianId: "b",
        locationId: "r2",
        duration: 30,
        status: "RESERVED",
      },
    ];
    expect(allocate({ occupied })![0].technicianId).toBe("b");
  });
  it("ignores cancelled work and resolves ties by fixed order", () => {
    expect(
      allocate({
        technicians: [
          tech("a", "FEMALE", ["face"], 5),
          tech("b", "FEMALE", ["face"], 1),
        ],
      })![0].technicianId,
    ).toBe("b");
    expect(
      allocate({
        occupied: [
          {
            start: +start - 1,
            end: +start + 100,
            technicianId: "a",
            locationId: "r1",
            duration: 900,
            status: "CANCELLED",
          },
        ],
      })![0].technicianId,
    ).toBe("a");
  });
  it("checks buffer overlap on both technician and location", () => {
    const occupied = [
      {
        start: +start - 3600000,
        end: +start + 900000,
        technicianId: "a",
        locationId: "r1",
        duration: 60,
        status: "COMPLETED",
      },
    ];
    expect(allocate({ occupied, technicians: [tech("a")] })).toBeNull();
    expect(allocate({ occupied, locationIds: ["r1"] })).toBeNull();
  });
  it("allows exact end boundary but rejects partial overlaps", () => {
    expect(
      allocate({
        technicians: [tech("a")],
        occupied: [
          {
            start: +start - 3600000,
            end: +start,
            technicianId: "a",
            locationId: "r1",
            duration: 60,
            status: "RESERVED",
          },
        ],
      })![0].technicianId,
    ).toBe("a");
  });
  it("rejects a party with too few positions, without partial results", () =>
    expect(
      allocate({ people: [person(), person()], locationIds: ["r1"] }),
    ).toBeNull());
  it("honours dated unavailability and full opening hours", () => {
    const t = tech("a");
    t.exceptions = { [date]: [] };
    expect(allocate({ technicians: [t] })).toBeNull();
    expect(allocate({ hours: [{ start: "09:00", end: "11:00" }] })).toBeNull();
  });
  it("requires service qualifications and an explicit compensation rule", () => {
    expect(
      allocate({ technicians: [tech("a", "FEMALE", ["massage"])] }),
    ).toBeNull();
    expect(allocate({ technicians: [{ ...tech("a"), rates: {} }] })).toBeNull();
  });
});
describe("beauty confirmed contracts", () => {
  it("does not preselect a gender", () => {
    expect(
      partyInput.safeParse({
        requestKey: crypto.randomUUID(),
        date,
        time: "10:00",
        contactName: "王",
        phone: "0912345678",
        isTrial: true,
        people: [{ name: "王", phone: "0912345678", serviceId: "face" }],
      }).success,
    ).toBe(false);
  });
  it("requires technician gender and has no predefined plan count", () => {
    expect(
      technicianInput.safeParse({
        name: "技師",
        serviceIds: [],
        weekly: [],
        rates: {},
      }).success,
    ).toBe(false);
    expect(
      planInput.parse({
        name: "自訂7次",
        sessions: 7,
        price: 900,
        validDays: 100,
        serviceIds: ["face"],
      }).sessions,
    ).toBe(7);
  });
  it("requires a percentage basis, but fixed needs none", () => {
    expect(rate.safeParse({ mode: "PERCENT", value: 50 }).success).toBe(false);
    expect(rate.parse({ mode: "FIXED", value: 0 })).toEqual({
      mode: "FIXED",
      value: 0,
    });
  });
  it("calculates original versus paid package unit basis and fixed per visit", () => {
    expect(
      serviceFee({ mode: "PERCENT", value: 50, base: "LIST" }, 10000, 8000, 10),
    ).toBe(500);
    expect(
      serviceFee({ mode: "PERCENT", value: 50, base: "PAID" }, 10000, 8000, 10),
    ).toBe(400);
    expect(serviceFee({ mode: "FIXED", value: 300 }, 10000, 8000, 10)).toBe(
      300,
    );
  });
});
it("hourly compensation excludes cleanup and needs no percentage base", () => {
  expect(serviceFee({ mode: "HOURLY", value: 400 }, 1500, 1200, 1, 90)).toBe(
    600,
  );
  expect(serviceFee({ mode: "FIXED", value: 400 }, 1500, 1200, 1, 90)).toBe(
    400,
  );
});
