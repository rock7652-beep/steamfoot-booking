import { describe, expect, it } from "vitest";
import { getDayCapacityIndicator, getSlotCapacityDisplay } from "@/lib/slot-capacity-display";

describe("getSlotCapacityDisplay", () => {
  it.each([
    [4, "available", "available", true, null],
    [3, "available", "available", true, null],
    [2, "low", "low", true, "剩餘 2 位"],
    [1, "low", "low", true, "僅剩 1 位"],
    [0, "full", "full", false, "已額滿"],
    [-1, "full", "full", false, "已額滿"],
  ] as const)("classifies remaining capacity %i", (remaining, capacityStatus, selectionStatus, canFit, label) => {
    expect(getSlotCapacityDisplay(5, 5 - remaining)).toMatchObject({
      remainingCapacity: remaining,
      capacityStatus,
      selectionStatus,
      canFitRequestedPeople: canFit,
      label,
    });
  });

  it("keeps a low-capacity slot unavailable when the requested party does not fit", () => {
    expect(getSlotCapacityDisplay(5, 3, 3)).toMatchObject({
      remainingCapacity: 2,
      capacityStatus: "low",
      selectionStatus: "insufficient",
      canFitRequestedPeople: false,
      label: "不可預約",
    });
  });

  it.each([
    [4, 0, "available"], [4, 1, "available"], [4, 2, "low"], [4, 3, "low"], [4, 4, "full"], [4, 5, "full"],
    [5, 0, "available"], [5, 2, "available"], [5, 3, "low"], [5, 4, "low"], [5, 5, "full"], [5, 6, "full"],
  ] as const)("handles capacity %i with %i booked people", (capacity, bookedPeople, status) => {
    expect(getSlotCapacityDisplay(capacity, bookedPeople).capacityStatus).toBe(status);
  });
});

describe("getDayCapacityIndicator", () => {
  it("prefers a selectable green slot over a low slot", () => {
    expect(getDayCapacityIndicator([{ capacity: 4, bookedPeople: 3 }, { capacity: 5, bookedPeople: 1 }], 1)).toBe("available");
  });

  it("returns yellow only when low slots are the best selectable option", () => {
    expect(getDayCapacityIndicator([{ capacity: 4, bookedPeople: 2 }], 2)).toBe("low");
  });

  it("returns red when operating slots cannot fit the requested party", () => {
    expect(getDayCapacityIndicator([{ capacity: 4, bookedPeople: 2 }], 3)).toBe("full");
  });

  it("keeps closed or no-slot days distinct", () => {
    expect(getDayCapacityIndicator([], 1)).toBeNull();
  });
});
