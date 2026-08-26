import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const query = readFileSync(new URL("../server/queries/booking.ts", import.meta.url), "utf8");
const dayPanel = readFileSync(new URL("../app/(dashboard)/dashboard/bookings/day-detail-panel.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../app/(dashboard)/dashboard/bookings/booking-calendar-desktop.tsx", import.meta.url), "utf8");

describe("dashboard recurring booking marker", () => {
  it("loads and displays the occurrence position", () => {
    expect(query).toContain("recurrenceGroup: { select: { totalOccurrences: true } }");
    expect(dayPanel).toContain("每週固定・第 {booking.recurrenceIndex}/{booking.recurrenceTotalOccurrences} 次");
    expect(calendar).toContain("固定 {booking.recurrenceIndex}/{booking.recurrenceTotalOccurrences}");
  });
});
