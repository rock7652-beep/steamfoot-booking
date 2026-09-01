import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("industry module migration contract", () => {
  it("defaults every existing and future store to Steamfoot", () => {
    const migration = readFileSync(
      resolve(root, "prisma/migrations/20260901123000_add_store_industry_module/migration.sql"),
      "utf8",
    );
    expect(migration).toContain("NOT NULL DEFAULT 'STEAMFOOT'");
    expect(migration).toContain("WHERE \"slug\" = 'demo' AND \"isDemo\" = true");
  });

  it("persists the module on Store", () => {
    const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("enum IndustryModule");
    expect(schema).toContain("industryModule");
    expect(schema).toContain("@default(STEAMFOOT)");
  });

  it("gates high-risk write paths with the authoritative firewall", () => {
    const steamfootFiles = [
      "src/server/actions/single-booking.ts",
      "src/server/actions/booking-checkout.ts",
    ];
    const spaFiles = [
      "src/server/actions/spa-checkout.ts",
      "src/server/actions/spa-operations.ts",
      "src/server/actions/spa-quick-booking.ts",
    ];
    for (const file of steamfootFiles) {
      expect(readFileSync(resolve(root, file), "utf8")).toContain("requireSteamfootStore");
    }
    for (const file of spaFiles) {
      expect(readFileSync(resolve(root, file), "utf8")).toContain("requireSpaStore");
    }
  });
});
