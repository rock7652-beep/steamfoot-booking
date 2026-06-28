import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bookings",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({
  TrialBookingDrawer: () => null,
}));

import { DayDetailPanel, type DayBooking } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";

function textFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function booking(overrides: Partial<DayBooking>): DayBooking {
  return {
    id: "booking-1",
    slotTime: "11:00",
    people: 1,
    attendedPeople: null,
    isMakeup: false,
    isCheckedIn: false,
    bookingStatus: "PENDING",
    bookingType: "PACKAGE_SESSION",
    expectedAmount: null,
    trialDefaultPrice: null,
    collected: false,
    collectedAmount: null,
    customer: {
      name: "陳沛妍",
      phone: "0912345678",
      serviceNote: null,
      assignedStaff: null,
      validPackageSessions: 5,
    },
    revenueStaff: null,
    serviceStaff: { id: "staff-1", displayName: "芊芊店長" },
    servicePlan: null,
    customerPlanWallet: null,
    ...overrides,
  };
}

describe("DayDetailPanel summary", () => {
  it("shows NO_SHOW people total instead of no-show booking count", () => {
    const html = renderToStaticMarkup(
      React.createElement(DayDetailPanel, {
        date: "2026-06-26",
        bookings: [booking({ bookingStatus: "NO_SHOW", people: 2 })],
        slots: [],
      }),
    );

    const text = textFromHtml(html);

    expect(text).toMatch(/未到人數\s+2/);
    expect(text).not.toMatch(/未到\s+1/);
  });
});
