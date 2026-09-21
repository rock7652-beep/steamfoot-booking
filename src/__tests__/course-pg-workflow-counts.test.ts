import {readFileSync} from "node:fs";
import {expect,it} from "vitest";

it("keeps the trial and checkout execution gates independent",()=>{
  const source=readFileSync(".github/workflows/booking-isolated-audit.yml","utf8");
  const trial=source.split('readFileSync("course-trial-pg-results.json", "utf8")')[1].split("throw new Error")[0];
  const checkout=source.split('readFileSync("course-checkout-pg-results.json", "utf8")')[1].split("throw new Error")[0];
  expect(trial).toContain("r.numTotalTests !== 6");
  expect(trial).toContain("r.numPassedTests !== 6");
  expect(checkout).toContain("r.numPassedTests !== 9");
  expect(trial).toContain("r.numPendingTests !== 0");
  expect(checkout).toContain("r.numPendingTests !== 0");
});
