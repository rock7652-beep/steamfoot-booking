import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUPERSEDED_SPA_MIGRATIONS,
  classifyMigrationRows,
  parseReadinessArgs,
  splitFingerprintStatements,
  validateContract,
} from "../../scripts/spa-production-migration-readiness.mjs";

const script = readFileSync(resolve("scripts/spa-production-migration-readiness.mjs"), "utf8");
const fingerprint = readFileSync(resolve("prisma/reconciliation/spa-release-fingerprint.sql"), "utf8");
const finalTables = [
  "SpaBooking", "SpaBookingGroup", "SpaBookingItem", "SpaCreditSale",
  "SpaEntitlement", "SpaEntitlementUse", "SpaPackage", "SpaPayment",
  "SpaPaymentRevision", "SpaReceipt", "SpaRefund", "SpaServiceLocation",
  "SpaSkill", "SpaStaffAvailability", "SpaStaffAvailabilityException",
  "SpaStaffCompensation", "SpaStaffSkill", "SpaStoredValueEntry",
  "SpaStoredValueWallet", "SpaTreatment", "SpaTreatmentServiceLocation",
  "SpaTreatmentSkill", "StoreModuleInstallation",
];
const firewallTables = [
  "Booking", "ServicePlan", "CustomerPlanWallet", "Transaction",
  "SpaBooking", "SpaBookingItem", "SpaEntitlement", "SpaEntitlementUse",
  "SpaPayment", "SpaStoredValueWallet", "SpaStoredValueEntry", "SpaTreatment",
  "SpaSkill", "SpaTreatmentSkill", "SpaStaffSkill", "SpaStaffAvailability",
  "SpaStaffAvailabilityException", "SpaStaffCompensation",
];
const constraintNames = [...new Set(
  ["prisma/reconciliation/spa-release-schema.sql", "prisma/reconciliation/spa-booking-resource-constraints.sql"].flatMap((path) =>
    [...readFileSync(resolve(path), "utf8").matchAll(/CONSTRAINT "([^"]+)"/g)].map((match) => match[1])
  ),
)];

function validContract() {
  return {
    tables: finalTables.map((name) => ({ name })),
    rls: finalTables.map((name) => ({ name, enabled: true })),
    grants: [],
    stores: { total: 3, steamfoot: 3, spa: 0, demo: 0 },
    modules: [{ columnName: "industryModule", dataType: "USER-DEFINED", udtName: "IndustryModule", isNullable: "NO", columnDefault: "'STEAMFOOT'::\"IndustryModule\"" }],
    firewalls: firewallTables.map((name) => ({ name })),
    functionDetails: [{ securityDefiner: true, config: ["search_path=pg_catalog, public"] }],
    functionGrants: [{ count: 0 }],
    constraints: constraintNames.map((name) => ({ name })),
    extension: [{ count: 1 }],
    ledger: [],
  };
}

describe("SPA Production migration readiness", () => {
  it("accepts only explicit inspect or confirmed reconciliation modes", () => {
    expect(parseReadinessArgs(["--inspect"])).toEqual({ mode: "inspect" });
    expect(parseReadinessArgs(["--reconcile-superseded", "--confirm=RECONCILE_SUPERSEDED_SPA_HISTORY"])).toEqual({ mode: "reconcile" });
    expect(() => parseReadinessArgs([])).toThrow("INVALID_ARGUMENTS");
    expect(() => parseReadinessArgs(["--reconcile-superseded"])).toThrow("INVALID_ARGUMENTS");
  });

  it("pins every superseded migration and never treats invalid history as applied", () => {
    expect(SUPERSEDED_SPA_MIGRATIONS).toHaveLength(8);
    for (const [name, checksum] of SUPERSEDED_SPA_MIGRATIONS) {
      expect(name).toMatch(/^2026\d{10}_[a-z0-9_]+$/);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(classifyMigrationRows([], checksum)).toBe("missing");
      expect(classifyMigrationRows([{ checksum, finishedAt: new Date(), rolledBackAt: null }], checksum)).toBe("applied");
      expect(classifyMigrationRows([{ checksum: "wrong", finishedAt: new Date(), rolledBackAt: null }], checksum)).toBe("invalid");
    }
  });

  it("executes the complete committed SPA fingerprint, not a partial substitute", () => {
    expect(splitFingerprintStatements(fingerprint).length).toBeGreaterThan(250);
    expect(() => splitFingerprintStatements("SELECT 1;")).toThrow("FINGERPRINT_PARSE_FAILED");
  });

  it("requires final isolated tables, RLS, no browser grants, firewalls, and zero Production SPA tenants", () => {
    const contract = validContract();
    expect(validateContract(contract)).toBe(true);
    expect(validateContract({ ...contract, tables: contract.tables.slice(1) })).toBe(false);
    expect(validateContract({ ...contract, tables: [...contract.tables, { name: "Treatment" }] })).toBe(false);
    expect(validateContract({ ...contract, grants: [{ name: "SpaBooking", count: 1 }] })).toBe(false);
    expect(validateContract({ ...contract, stores: { ...contract.stores, spa: 1 } })).toBe(false);
    expect(validateContract({ ...contract, firewalls: contract.firewalls.slice(1) })).toBe(false);
  });

  it("keeps reconciliation separate from schema deployment and direct ledger SQL", () => {
    expect(script).toContain('"migrate", "resolve", "--applied"');
    expect(script).not.toContain('"migrate", "deploy"');
    expect(script).not.toContain('INSERT INTO "_prisma_migrations"');
    expect(script).toContain("SET TRANSACTION READ ONLY");
    expect(script).toContain("pg_try_advisory_xact_lock");
  });
});
