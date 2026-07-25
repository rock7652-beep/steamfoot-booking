import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("digital butler dashboard entry entitlement contract", () => {
  it("passes the effective store entitlement into sidebar navigation", () => {
    const layout = read("src/app/(dashboard)/layout.tsx");
    const sidebar = read("src/components/sidebar.tsx");

    expect(layout).toContain(
      "hasStoreFeature(\n          effectiveStoreId,\n          FEATURES.DIGITAL_BUTLER",
    );
    expect(layout).toContain("effectiveFeatures={effectiveFeatures}");
    expect(sidebar).toContain("requiredFeature: FEATURES.DIGITAL_BUTLER");
    expect(sidebar).toContain(
      "effectiveFeatures[item.requiredFeature] ?? hasFeature",
    );
  });

  it("keeps both pages behind the same backend entitlement guard", () => {
    const leads = read("src/app/(dashboard)/dashboard/digital-butler/leads/page.tsx");
    const flows = read(
      "src/app/(dashboard)/dashboard/settings/digital-butler/page.tsx",
    );

    for (const page of [leads, flows]) {
      expect(page).toContain("requireDigitalButlerEntitlement(storeId)");
      expect(page).not.toContain("requireFeature(");
      expect(page).not.toContain("checkCurrentStoreFeature(");
    }
  });
});
