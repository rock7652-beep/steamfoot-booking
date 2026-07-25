import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260725150000_add_digital_butler_lead_tracking/migration.sql",
  "utf8",
);
const action = readFileSync("src/server/actions/digital-butler-leads.ts", "utf8");
const query = readFileSync("src/server/queries/digital-butler-leads.ts", "utf8");

describe("digital butler lead tracking security contract", () => {
  it("enforces store-consistent assignee and activity relations in the database", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("assignedStaffId", "storeId") REFERENCES "Staff"("id", "storeId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("leadId", "storeId") REFERENCES "DigitalButlerLead"("id", "storeId")',
    );
    expect(migration).toContain(
      'ALTER TABLE "DigitalButlerLeadActivity" ENABLE ROW LEVEL SECURITY',
    );
  });

  it("derives the writable store from the session and scopes every target lookup", () => {
    expect(action).toContain("getActiveStoreForRead(user)");
    expect(action).toContain("where: { id: data.leadId, storeId }");
    expect(action).toContain(
      'where: { id: data.assignedStaffId, storeId, status: "ACTIVE" }',
    );
    expect(action).not.toContain("storeId: z.");
  });

  it("decrypts phone only inside the authorized server query", () => {
    expect(query).toContain("requireDigitalButlerEntitlement(storeId)");
    expect(query).toContain("decryptDigitalButlerValue");
    expect(query).toContain("phoneCiphertext: undefined");
  });
});
