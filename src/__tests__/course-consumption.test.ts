import { describe, expect, it } from "vitest";
import { coursePointEffect } from "@/lib/course-consumption";

describe("course personal consumption ledger", () => {
  it("keeps a reservation hold separate from actual consumption", () => {
    expect(coursePointEffect("RESERVE", 2, false)).toEqual({
      type: "HOLD",
      status: "保留中（尚未扣抵）",
      quantity: -2,
    });
    expect(coursePointEffect("DEBIT", 2, false)).toEqual({
      type: "USAGE",
      status: "已扣抵",
      quantity: -2,
    });
  });

  it("shows released and corrected quota with the correct direction", () => {
    expect(coursePointEffect("RELEASE", 1, false)?.quantity).toBe(1);
    expect(coursePointEffect("CORRECT:ATTENDED:NO_SHOW:any", 1, false)).toEqual({
      type: "RETURN",
      status: "點名更正後退回",
      quantity: 1,
    });
    expect(coursePointEffect("CORRECT:NO_SHOW:ATTENDED:any", 1, false)).toEqual({
      type: "USAGE",
      status: "點名更正後扣抵",
      quantity: -1,
    });
    expect(coursePointEffect("CORRECT:RESERVED:NO_SHOW:any", 1, false)).toEqual({
      type: "RETURN",
      status: "更正後釋放保留",
      quantity: 1,
    });
  });

  it("keeps term-course no-show as consumed during corrections", () => {
    expect(coursePointEffect("CORRECT:ATTENDED:NO_SHOW:any", 1, true)).toBeNull();
  });
});
