import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("SPA treatment phase-one schema", () => {
  it("keeps treatments separate from legacy session plans and wallets", () => {
    expect(schema).toContain("model ServicePlan {");
    expect(schema).toContain("model CustomerPlanWallet {");
    expect(schema).toContain("model Treatment {");
    expect(schema).toContain("model ProfessionalSkill {");
    expect(schema).not.toMatch(/model Treatment[\s\S]*?sessionCount\s+Int/);
  });

  it("uses store-scoped compound foreign keys for staff and skill links", () => {
    expect(schema).toContain(
      "@relation(fields: [staffId, storeId], references: [id, storeId], onDelete: Cascade)",
    );
    expect(schema).toContain(
      "@relation(fields: [skillId, storeId], references: [id, storeId], onDelete: Cascade)",
    );
    expect(schema).toContain(
      "@relation(fields: [treatmentId, storeId], references: [id, storeId], onDelete: Cascade)",
    );
  });

  it("stores immutable booking-time treatment facts", () => {
    expect(schema).toContain("treatmentNameSnapshot");
    expect(schema).toContain("treatmentVariantSnapshot");
    expect(schema).toContain("treatmentPriceSnapshot");
    expect(schema).toContain("treatmentServiceMinutesSnapshot");
    expect(schema).toContain("treatmentBufferMinutesSnapshot");
  });

  it("models weekly availability and dated exceptions without replacing duty assignments", () => {
    expect(schema).toContain("model DutyAssignment {");
    expect(schema).toContain("model StaffWeeklyAvailability {");
    expect(schema).toContain("model StaffAvailabilityException {");
    expect(schema).toContain("UNAVAILABLE");
    expect(schema).toContain("AVAILABLE");
  });
});
