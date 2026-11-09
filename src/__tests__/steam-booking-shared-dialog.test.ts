import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const manager = readFileSync("src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx", "utf8");
const rows = readFileSync("src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx", "utf8");

it("keeps the shared daily roster mounted and covered behind booking details", () => {
  expect(manager).toContain('presentation="centered"');
  expect(manager).toContain("width={1200}");
  expect(manager).toContain("open={!!selectedDate}");
  expect(manager).toContain("covered={!!activeBookingId}");
});

it("retains shared customer identity and exposes the existing label settings", () => {
  expect(rows).toContain("<CustomerListIdentity customerId={booking.customer.id}");
  expect(manager).toContain("!readOnly && <CustomerLabelsSettingsLink />");
});
