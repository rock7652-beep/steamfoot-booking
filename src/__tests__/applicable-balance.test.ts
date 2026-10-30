import { expect, it } from "vitest";
import { summarizeApplicableBalance, type ApplicableBalanceCard } from "@/lib/applicable-balance";

const card = (id: string, remaining: number, held = 0, unit: ApplicableBalanceCard["unit"] = "SESSION"): ApplicableBalanceCard =>
  ({ id, name: id, remaining, held, unit, expiresAt: "2027-01-01", shared: false });

it("shows the renewal in the total even when the older card has only one lesson", () => {
  expect(summarizeApplicableBalance([card("old", 1), card("renewal", 20)]).groups)
    .toEqual([{ unit: "SESSION", remaining: 21, held: 0, available: 21 }]);
});
it("subtracts all holds, including this booking, without subtracting attendance twice", () => {
  const reserved = summarizeApplicableBalance([card("old", 1, 1), card("new", 20, 3)]);
  const attended = summarizeApplicableBalance([card("old", 0), card("new", 20, 3)]);
  expect(reserved.groups[0].available).toBe(17);
  expect(attended.groups[0].available).toBe(17);
});
it("keeps points, lessons and beauty uses separate and does not duplicate shared cards", () => {
  const shared = { ...card("shared", 20, 2), shared: true };
  expect(summarizeApplicableBalance([shared, shared, card("points", 100, 10, "POINT"), card("beauty", 5, 1, "USE")]).groups)
    .toEqual([
      { unit: "USE", remaining: 5, held: 1, available: 4 },
      { unit: "POINT", remaining: 100, held: 10, available: 90 },
      { unit: "SESSION", remaining: 20, held: 2, available: 18 },
    ]);
});
it("clamps availability per card and returns an empty summary without inventing rights", () => {
  expect(summarizeApplicableBalance([card("overheld", 1, 3), card("new", 20)]).groups[0].available).toBe(20);
  expect(summarizeApplicableBalance([])).toEqual({ groups: [], cards: [] });
});
