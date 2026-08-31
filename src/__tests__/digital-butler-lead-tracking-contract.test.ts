import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260725150000_add_digital_butler_lead_tracking/migration.sql",
  "utf8",
);
const action = readFileSync("src/server/actions/digital-butler-leads.ts", "utf8");
const query = readFileSync("src/server/queries/digital-butler-leads.ts", "utf8");
const leadList = readFileSync("src/app/(dashboard)/dashboard/digital-butler/leads/lead-list.tsx", "utf8");

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

  it("validates the resolved store and scopes every target lookup", () => {
    expect(leadList).toContain("storeId: resolvedStoreId");
    expect(action).toContain('validateStoreAccess(user, data.storeId, "write")');
    expect(action).toContain("where: { id: data.leadId, storeId }");
    expect(action).toContain(
      'where: { id: data.assignedStaffId, storeId, status: "ACTIVE" }',
    );
    expect(action).toContain("storeId: z.string().min(1)");
  });

  it("decrypts phone only inside the authorized server query", () => {
    expect(query).toContain("requireDigitalButlerEntitlement(storeId)");
    expect(query).toContain("decryptDigitalButlerValue");
    expect(query).toMatch(
      /const \{[\s\S]*phoneCiphertext,[\s\S]*\.\.\.safeLead[\s\S]*\} = lead;/,
    );
  });
});
