import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const spaSchema = readFileSync(resolve(root, "spa-prisma/schema.prisma"), "utf8");
const mainSchema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(root, "prisma/migrations/20260901110000_add_isolated_spa_models/migration.sql"),
  "utf8",
);

describe("isolated SPA data model", () => {
  it("uses a dedicated generated Prisma client", () => {
    expect(spaSchema).toContain('output   = "../src/generated/spa-client"');
    expect(spaSchema).toContain("model SpaBooking");
    expect(spaSchema).toContain("model SpaEntitlement");
    expect(spaSchema).toContain("model SpaPayment");
  });

  it("cannot query Steamfoot business models from the SPA client", () => {
    for (const forbidden of [
      "model Booking ",
      "model Transaction ",
      "model CustomerPlanWallet ",
      "model WalletSession ",
    ]) {
      expect(spaSchema).not.toContain(forbidden);
    }
  });

  it("does not expose SPA business models through the Steamfoot client", () => {
    for (const isolated of [
      "model SpaBooking ",
      "model SpaBookingItem ",
      "model SpaEntitlement ",
      "model SpaEntitlementUse ",
      "model SpaPayment ",
    ]) {
      expect(mainSchema).not.toContain(isolated);
    }
  });

  it("uses store-scoped ownership and never references Steamfoot ledgers", () => {
    expect(migration).toContain('REFERENCES "Customer"("id", "storeId")');
    expect(migration).toContain('REFERENCES "Staff"("id", "storeId")');
    expect(migration).toContain('REFERENCES "SpaBooking"("id", "storeId")');
    expect(migration).not.toContain('REFERENCES "Booking"');
    expect(migration).not.toContain('REFERENCES "Transaction"');
    expect(migration).not.toContain('REFERENCES "CustomerPlanWallet"');
  });

  it("keeps every SPA table private behind forced RLS", () => {
    for (const table of [
      "SpaBooking",
      "SpaBookingItem",
      "SpaEntitlement",
      "SpaEntitlementUse",
      "SpaPayment",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("REVOKE ALL ON TABLE");
  });
});
