import { describe, expect, it } from "vitest";
import { managerNotificationPreviewSamples } from "./manager-notification-preview";

describe("manager notification preview inventory", () => {
  it("covers all nine steamfoot events with usable card contents", () => {
    const samples = managerNotificationPreviewSamples();
    expect(samples).toHaveLength(9);
    expect(new Set(samples.map(sample => sample.key)).size).toBe(9);
    for (const sample of samples) {
      expect(sample.title).toBeTruthy();
      expect(sample.details.length).toBeGreaterThan(0);
      expect(sample.actions.length).toBeGreaterThan(0);
    }
  });
  it("excludes steamfoot-only events and uses course attendance wording", () => {
    const samples = managerNotificationPreviewSamples(true);
    expect(samples).toHaveLength(7);
    expect(samples.map(sample => sample.key)).not.toContain("trial");
    expect(samples.map(sample => sample.key)).not.toContain("vip");
    expect(samples.find(sample => sample.key === "incomplete")?.title).toContain("出席");
  });
});

it("beauty exposes only its five connected types, with its actual service duration wording",()=>{const rows=managerNotificationPreviewSamples(false,true);expect(rows.map(r=>r.key)).toEqual(["sameDay","trial","payment","incomplete","digest"]);expect(rows.find(r=>r.key==="incomplete")?.details.join("\n")).toContain("服務結束一小時");expect(rows.map(r=>r.details.join(" ")).join(" ")).not.toContain("出席");});
