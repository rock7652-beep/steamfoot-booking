import { describe, expect, it } from "vitest";
import { generateWeeklyDateStrings } from "@/lib/date-utils";

describe("generateWeeklyDateStrings", () => {
  it.each([
    [1, ["2026-01-28"]],
    [2, ["2026-01-28", "2026-02-04"]],
    [5, ["2026-01-28", "2026-02-04", "2026-02-11", "2026-02-18", "2026-02-25"]],
    [8, ["2026-01-28", "2026-02-04", "2026-02-11", "2026-02-18", "2026-02-25", "2026-03-04", "2026-03-11", "2026-03-18"]],
    [12, ["2026-01-28", "2026-02-04", "2026-02-11", "2026-02-18", "2026-02-25", "2026-03-04", "2026-03-11", "2026-03-18", "2026-03-25", "2026-04-01", "2026-04-08", "2026-04-15"]],
  ])("generates %i weekly occurrences", (weeks, expected) => {
    expect(generateWeeklyDateStrings("2026-01-28", weeks)).toEqual(expected);
  });

  it("crosses a year boundary", () => {
    expect(generateWeeklyDateStrings("2026-12-23", 3)).toEqual([
      "2026-12-23", "2026-12-30", "2027-01-06",
    ]);
  });

  it("keeps leap day arithmetic correct", () => {
    expect(generateWeeklyDateStrings("2024-02-22", 3)).toEqual([
      "2024-02-22", "2024-02-29", "2024-03-07",
    ]);
  });

  it("rejects impossible dates and invalid week counts", () => {
    expect(() => generateWeeklyDateStrings("2026-02-30", 2)).toThrow("Invalid Taiwan date");
    expect(() => generateWeeklyDateStrings("2026-02-01", 0)).toThrow("positive integer");
  });
});
