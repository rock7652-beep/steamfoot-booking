import { describe, expect, it } from "vitest";
import {
  AUDIT_RUN_MIGRATION,
  RECONCILIATION_SEQUENCE,
  RLS_CONFIRMATION,
  RESOLVE_CONFIRMATION,
  hasSchemaContract,
  safeRlsState,
} from "../../scripts/production-migration-reconciliation";

const validSnapshot = {
  columns: ["id", "storeId", "requestedByUserId", "createdAt", "completedAt", "status", "appValidated", "pageTokenMatches", "callbackMatches", "configuredFields", "missingFields", "pageAttached", "callsSafeSummary", "errorCode"],
  indexes: ["MessengerAuditRun_pkey", "MessengerAuditRun_storeId_createdAt_idx", "MessengerAuditRun_requestedByUserId_createdAt_idx"],
  constraints: ["MessengerAuditRun_storeId_fkey", "MessengerAuditRun_requestedByUserId_fkey"],
  rlsEnabled: true,
  policyCount: 0,
  rowCount: 7,
};

describe("Production migration reconciliation contract", () => {
  it("uses one fixed, ordered migration sequence and independent confirmation strings", () => {
    expect(RECONCILIATION_SEQUENCE).toEqual([AUDIT_RUN_MIGRATION, "20260801090000_add_transaction_payment_splits"]);
    expect(RLS_CONFIRMATION).not.toBe(RESOLVE_CONFIRMATION);
  });

  it("fails closed for incomplete schema contracts, policies, or disabled RLS", () => {
    expect(hasSchemaContract(validSnapshot)).toBe(true);
    expect(safeRlsState(validSnapshot)).toBe(true);
    expect(hasSchemaContract({ ...validSnapshot, columns: validSnapshot.columns.slice(1) })).toBe(false);
    expect(safeRlsState({ ...validSnapshot, rlsEnabled: false })).toBe(false);
    expect(safeRlsState({ ...validSnapshot, policyCount: 1 })).toBe(false);
  });

  it("keeps Production-only mutation commands out of Preview and CI entrypoints", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile("scripts/production-migration-reconciliation.ts", "utf8"));
    expect(source).toContain('process.env.VERCEL_ENV !== "production"');
    expect(source).toContain('"--stage=repair-rls"');
    expect(source).toContain('"--stage=resolve-audit-run"');
    expect(source).toContain('"migrate", "resolve", "--applied"');
  });
});
