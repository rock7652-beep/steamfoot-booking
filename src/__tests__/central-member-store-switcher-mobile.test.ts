import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(customer)/central-member-store-switcher.tsx"),
  "utf8",
);

describe("central member mobile store switcher", () => {
  it("presents an explicit tap-friendly store switch control", () => {
    expect(source).toContain("目前門市");
    expect(source).toContain("切換門市");
    expect(source).toContain("min-h-11");
    expect(source).toContain("touch-manipulation");
    expect(source).toContain("select-none");
  });

  it("keeps server-verified form submission for each store", () => {
    expect(source).toContain("selectCentralMemberStoreAction");
    expect(source).toContain('name="storeSlug"');
    expect(source).toContain("store.storeSlug");
    expect(source).toContain('type="submit"');
  });
});
