import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(customer)/book/new/booking-calendar-view.tsx"),
  "utf8",
);

describe("customer book-again flow", () => {
  it("refreshes availability and offers to book the next appointment", () => {
    expect(source).toContain("再預約下一次");
    expect(source).toContain("loadSlots(dateStr)");
    expect(source).toContain("setPreferredSlotTime(slotTime)");
    expect(source).toContain("router.refresh()");
  });

  it("keeps the previous time only when it still fits the requested people", () => {
    expect(source).toContain("getSlotCapacityDisplay(slot.capacity, slot.bookedCount, people)");
    expect(source).toContain("display.canFitRequestedPeople");
    expect(source).toContain("目前不可用，請改選其他時段");
  });
});
