import { describe, expect, it } from "vitest";
import { healthRecordInputSchema } from "@/lib/health-record-input";

const valid = {
  requestId: "2fd4317a-8f50-4cdd-9c37-4e92fa019ab8",
  measuredAt: "2026-08-24",
  weight: "60.5",
  bodyFat: "",
  muscleMass: "",
  boneMass: "",
  visceralFat: "",
  bmr: "",
  bodyWater: "",
  metabolicAge: "",
  note: null,
};

describe("healthRecordInputSchema", () => {
  it("normalizes empty metrics to null", () => {
    const parsed = healthRecordInputSchema.parse(valid);
    expect(parsed.weight).toBe(60.5);
    expect(parsed.bodyFat).toBeNull();
  });

  it("requires at least one metric", () => {
    const result = healthRecordInputSchema.safeParse({ ...valid, weight: "" });
    expect(result.success).toBe(false);
  });

  it("rejects impossible physical values", () => {
    const result = healthRecordInputSchema.safeParse({ ...valid, weight: "500" });
    expect(result.success).toBe(false);
  });
});
