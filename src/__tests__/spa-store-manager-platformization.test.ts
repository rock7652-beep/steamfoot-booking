import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { spaSkillId, spaSkillKeyFromId } from "@/lib/spa-store-identifiers";

const managerFiles = [
  "src/app/(dashboard)/dashboard/spa-schedule/page.tsx",
  "src/app/(dashboard)/dashboard/bookings/new/page.tsx",
  "src/app/(dashboard)/dashboard/plans/page.tsx",
  "src/app/(dashboard)/dashboard/staff/page.tsx",
  "src/app/(dashboard)/dashboard/settings/page.tsx",
  "src/app/(dashboard)/dashboard/settings/hours/page.tsx",
  "src/server/actions/spa-booking-availability.ts",
  "src/server/actions/spa-quick-booking.ts",
  "src/server/actions/spa-checkout.ts",
  "src/server/actions/spa-operations.ts",
  "src/server/actions/spa-schedule-settings.ts",
];

describe("SPA store manager platformization", () => {
  it("does not gate reusable manager pages and actions by demo-store", () => {
    for (const file of managerFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("storeId !== SPA_DEMO_STORE.id");
      expect(source, file).not.toContain("activeStoreId === SPA_DEMO_STORE.id");
      expect(source, file).not.toContain("isSpaDemoStoreId");
    }
  });

  it("keeps legacy demo identifiers while namespacing every new SPA store", () => {
    expect(spaSkillId("demo-store", "body")).toBe("spa-demo-skill-body");
    expect(spaSkillId("store-spa-qa", "body")).toBe(
      "store-spa-qa-spa-skill-body",
    );
    expect(spaSkillKeyFromId("store-spa-qa-spa-skill-face")).toBe("face");
  });

  it("uses the authoritative SPA module gate before reusable writes", () => {
    for (const file of managerFiles.filter((file) =>
      file.includes("/actions/"),
    )) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("requireSpaStore");
    }
  });

  it("limits the SPA store sidebar to the five manager modules", () => {
    const sidebar = readFileSync("src/components/sidebar.tsx", "utf8");
    expect(sidebar).toContain("spaManagerRoutes");
    for (const path of [
      "/dashboard/bookings",
      "/dashboard/customers",
      "/dashboard/plans",
      "/dashboard/staff",
      "/dashboard/settings",
    ]) {
      expect(sidebar).toContain(`"${path}"`);
    }
  });

  it("keeps the full SPA manager operations interface on authenticated stores", () => {
    const workspace = readFileSync(
      "src/app/(dashboard)/dashboard/bookings/spa-provider-schedule.tsx",
      "utf8",
    );
    for (const label of [
      "今日營運",
      "當日營運摘要",
      "每日營運與帳務",
      "時間 × 芳療師",
      "現場快速預約",
    ]) {
      expect(workspace).toContain(label);
    }
    expect(workspace).not.toContain("SPA_DEMO_STORE");
    expect(workspace).not.toContain("SPA_DEMO_PROVIDERS");
    expect(workspace).not.toContain("createSpaDemoCustomerBooking");
  });
});
