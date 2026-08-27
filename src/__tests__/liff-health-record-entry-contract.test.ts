import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync("src/app/(liff)/liff/health/health-view.tsx", "utf8");
const form = readFileSync("src/app/(customer)/health/new/health-record-form.tsx", "utf8");
const action = readFileSync("src/server/actions/liff-health.ts", "utf8");

describe("LIFF native health record entry", () => {
  it("keeps the customer inside LIFF and reuses the web form", () => {
    expect(view).toContain("/liff/health/new");
    expect(view).not.toContain("href={`/s/${storeSlug}/health/new`}");
    expect(form).toContain('surface?: "web" | "liff"');
    expect(form).toContain('surface === "liff" ? saveLiffHealthRecord');
    expect(view.match(/<StartHealthFlowButton storeSlug=\{storeSlug\} \/>/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps visceral fat first and uses the shared validation schema", () => {
    expect(form.indexOf('["visceralFat", "內臟脂肪"')).toBeGreaterThan(-1);
    expect(form.indexOf('["visceralFat", "內臟脂肪"')).toBeLessThan(
      form.indexOf('["weight", "體重"'),
    );
    expect(action).toContain("healthRecordInputSchema.safeParse");
    expect(action).toContain("resolveCentralMemberCustomerForStore");
  });
});
