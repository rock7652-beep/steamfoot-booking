import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(
  "src/app/(customer)/health/new/health-record-form.tsx",
  "utf8",
);

describe("health record form field order", () => {
  it("follows the measurement device entry sequence on mobile", () => {
    const expectedOrder = [
      '["visceralFat", "內臟脂肪"',
      '["weight", "體重"',
      '["bmi", "BMI"',
      '["bodyFat", "體脂肪"',
      '["muscleMass", "肌肉量"',
      '["boneMass", "骨量"',
      '["bmr", "基礎代謝"',
      '["metabolicAge", "體內年齡"',
      '["bodyWater", "體水分"',
    ];

    const indexes = expectedOrder.map((field) => form.indexOf(field));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
});
