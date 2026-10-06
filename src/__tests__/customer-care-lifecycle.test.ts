import { describe, expect, it } from "vitest";
import { careDisposition, type CareActivity } from "@/lib/customer-care-lifecycle";
const activity: CareActivity = { id: "f", reason: "birthday", year: 2026, result: "CONTACTED", note: null, date: "2026/10/06", by: "店長", nextDate: null };
describe("care lifecycle", () => {
  it("acknowledges this year's birthday only, without dismissing other reminders", () => {
    expect(careDisposition("birthday", 2026, "2026-10-06", activity).state).toBe("handled");
    expect(careDisposition("birthday", 2027, "2027-10-06", activity).state).toBe("pending");
    expect(careDisposition("low", 2026, "2026-10-06", activity).state).toBe("pending");
    expect(careDisposition("birthday", 2026, "2026-10-06", { ...activity, reason: "low" }).state).toBe("pending");
    expect(careDisposition("birthday", 2026, "2026-10-06", { ...activity, result: "NO_ANSWER" }).state).toBe("pending");
  });
  it("defers only the corresponding reason and restores it on the follow-up date", () => {
    const contact = { ...activity, reason: "inactive" as const, year: null, nextDate: "2026-10-13" };
    expect(careDisposition("inactive", 2026, "2026-10-12", contact).state).toBe("handled");
    expect(careDisposition("inactive", 2026, "2026-10-13", contact)).toEqual({ state: "pending", label: "追蹤到期" });
    expect(careDisposition("expiring", 2026, "2026-10-12", contact).state).toBe("pending");
  });
  it("uses actual reservations, restores after cancellation, and does not mistake contact BOOKED for a reservation", () => {
    expect(careDisposition("inactive", 2026, "2026-10-06", null, "2026/10/15 10:00").label).toBe("已預約");
    expect(careDisposition("inactive", 2026, "2026-10-06", null, null).state).toBe("pending");
    expect(careDisposition("inactive", 2026, "2026-10-06", { ...activity, reason: "inactive", result: "BOOKED" }).state).toBe("pending");
    expect(careDisposition("trial", 2026, "2026-10-06", null, "2026/10/15 10:00").state).toBe("pending");
  });
});
