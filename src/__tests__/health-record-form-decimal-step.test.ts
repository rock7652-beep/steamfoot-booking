import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(
  "src/app/(customer)/health/new/health-record-form.tsx",
  "utf8",
);

describe("health record decimal input steps", () => {
  it("allows Tanita half-step visceral fat values such as 4.5", () => {
    expect(form).toContain('["visceralFat", "內臟脂肪", "", "0.5"]');
    expect(form).toContain("內臟脂肪可填入 4.5 等半級數值");
  });
});
