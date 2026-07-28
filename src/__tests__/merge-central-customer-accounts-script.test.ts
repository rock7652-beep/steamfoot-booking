import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/merge-central-customer-accounts.ts"),
  "utf8",
);

describe("central customer account merge repair", () => {
  it("defaults to dry run and requires two exact write confirmations", () => {
    expect(script).toContain('process.env.CONFIRM_WRITE === "1"');
    expect(script).toContain("CONFIRM_SOURCE_USER_ID");
    expect(script).toContain("CONFIRM_TARGET_USER_ID");
    expect(script).toContain("write confirmation IDs do not exactly match");
    expect(script).toContain("if (!confirmWrite) return");
  });

  it("fails closed on identity, role, store, and ownership conflicts", () => {
    expect(script).toContain('source.role !== "CUSTOMER"');
    expect(script).toContain("actor must be an active ADMIN or OWNER");
    expect(script).toContain("source user must own exactly the selected customer");
    expect(script).toContain("source user still owns central identity links");
    expect(script).toContain("source user has a staff identity");
    expect(script).toContain("customer has no verified central link to target user");
    expect(script).toContain("identity link store does not match customer store");
    expect(script).toContain("target is missing verified");
  });

  it("preserves operational rows and both login identities", () => {
    expect(script).toContain("tx.account.updateMany");
    expect(script).toContain("data: { userId: target.id }");
    expect(script).toContain("tx.customer.update");
    expect(script).not.toContain("tx.booking.updateMany");
    expect(script).not.toContain("tx.customerPlanWallet.updateMany");
    expect(script).not.toContain("tx.transaction.updateMany");
    expect(script).not.toContain("tx.customer.delete");
  });

  it("revokes the duplicate login and writes a durable audit record atomically", () => {
    expect(script).toContain("isolationLevel: \"Serializable\"");
    expect(script).toContain("tx.session.deleteMany");
    expect(script).toContain('status: "SUSPENDED"');
    expect(script).toContain("passwordHash: null");
    expect(script).toContain("MERGE_DUPLICATE_CUSTOMER_ACCOUNT");
    expect(script).toContain("operationalCustomerRowsMoved: false");
  });

  it("does not print raw identifiers", () => {
    expect(script).toContain("maskId(state.source.id)");
    expect(script).toContain("maskId(state.target.id)");
    expect(script).toContain("maskId(state.customer.id)");
  });
});
