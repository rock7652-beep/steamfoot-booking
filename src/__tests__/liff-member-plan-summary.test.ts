import { describe, expect, it } from "vitest";
import { getMemberPlanSummary } from "@/lib/liff/member-plan-summary";

describe("getMemberPlanSummary", () => {
  it("counts an upcoming booking even when it is not reserved from the active plan", () => {
    expect(
      getMemberPlanSummary(
        [{ remainingSessions: 10, availableToBook: 10 }],
        [{ people: 1 }],
      ),
    ).toEqual({
      totalUsable: 10,
      totalBooked: 1,
      totalBookable: 10,
    });
  });

  it("aggregates multiple active plans and multi-person upcoming bookings", () => {
    expect(
      getMemberPlanSummary(
        [
          { remainingSessions: 4, availableToBook: 3 },
          { remainingSessions: 6, availableToBook: 6 },
        ],
        [{ people: 2 }, { people: 1 }],
      ),
    ).toEqual({
      totalUsable: 10,
      totalBooked: 3,
      totalBookable: 9,
    });
  });
});
