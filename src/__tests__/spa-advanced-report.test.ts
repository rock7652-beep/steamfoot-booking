import { describe, expect, it } from "vitest";
import { buildSpaAdvancedReport } from "@/lib/spa-advanced-report";
import type { SpaDemoBooking, SpaDemoProvider } from "@/lib/spa-demo-store";

const providers = [
  { id: "staff-08", badge: "08", name: "陳語安", compensationMode: "PERCENTAGE", compensationValue: 40 },
  { id: "staff-10", badge: "10", name: "張若琳", compensationMode: "FIXED", compensationValue: 500 },
] as SpaDemoProvider[];

function booking(overrides: Partial<SpaDemoBooking>): SpaDemoBooking {
  return {
    id: "booking-1", date: "2026-09-01", time: "15:30", customer: "彥陸",
    service: "全身精油舒壓", serviceItems: ["全身精油舒壓"], providerId: "staff-08",
    durationMinutes: 60, bufferMinutes: 30, status: "已完成", tone: "slate",
    remainingSessions: null, note: "無", partySize: 2, guestIndex: 1, price: 1300,
    settlementLabel: "現金", settlementAmount: 2800, settlementScope: "GROUP",
    ...overrides,
  };
}

describe("SPA advanced operations report", () => {
  it("calculates net revenue and reverses refunded staff commission", () => {
    const report = buildSpaAdvancedReport([
      booking({ id: "booking-1" }),
      booking({ id: "booking-2", providerId: "staff-10", guestIndex: 2, price: 1500, refundedAt: "2026-09-01T10:00:00.000Z", refundAmount: 1500 }),
    ], providers, "2026-09-01", "2026-09-30");

    expect(report).toMatchObject({ bookingGroups: 1, completedServices: 2, grossReceived: 2800, refundAmount: 1500, netReceived: 1300, averageGroupSpend: 1300 });
    expect(report.providers[0]).toMatchObject({ providerId: "staff-08", netServiceAmount: 1300, compensationAmount: 520 });
    expect(report.providers[1]).toMatchObject({ providerId: "staff-10", refundedServices: 1, netServiceAmount: 0, compensationAmount: 0 });
  });
});
