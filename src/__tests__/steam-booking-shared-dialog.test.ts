import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const manager = readFileSync("src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx", "utf8");
const rows = readFileSync("src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx", "utf8");

it("uses the course shared centered container without overlapping booking details", () => {
  expect(manager).toContain('presentation="centered"');
  expect(manager).toContain("width={1200}");
  expect(manager).toContain("open={!!selectedDate && !activeBookingId}");
});

it("retains shared customer identity and exposes the existing label settings", () => {
  expect(rows).toContain("<CustomerListIdentity customerId={booking.customer.id}");
  expect(manager).toContain("!readOnly && <CustomerLabelsSettingsLink />");
});
