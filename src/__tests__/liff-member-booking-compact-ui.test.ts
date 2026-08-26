import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const memberForm = readFileSync(
  "src/app/(liff)/liff/member-booking/member-booking-form.tsx",
  "utf8",
);
const trialForm = readFileSync(
  "src/app/(liff)/liff/trial-booking/trial-booking-form.tsx",
  "utf8",
);

describe("LIFF member booking compact flow", () => {
  it("shows an explicit date then slot sequence", () => {
    expect(memberForm).toContain("1. 選擇日期");
    expect(memberForm).toContain("2. 選擇時段");
  });

  it("enables compact calendar only for member booking", () => {
    expect(memberForm).toMatch(/requestedPeople=\{people\}\s+compact/);
    expect(trialForm).not.toMatch(/requestedPeople=\{people\}\s+compact/);
  });
});
