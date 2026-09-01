import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const spaSchema = readFileSync(resolve(process.cwd(), "spa-prisma/schema.prisma"), "utf8");

describe("SPA treatment phase-one schema", () => {
  it("keeps treatments separate from legacy session plans and wallets", () => {
    expect(schema).toContain("model ServicePlan {");
    expect(schema).toContain("model CustomerPlanWallet {");
    expect(schema).not.toContain("model Treatment {");
    expect(schema).not.toContain("model ProfessionalSkill {");
    expect(spaSchema).toContain("model SpaTreatment {");
    expect(spaSchema).toContain("model SpaSkill {");
    expect(spaSchema).not.toMatch(/model SpaTreatment[\s\S]*?sessionCount\s+Int/);
  });

  it("uses store-scoped compound foreign keys for staff and skill links", () => {
    expect(spaSchema).toContain(
      "@relation(fields: [skillId, storeId], references: [id, storeId], onDelete: Cascade)",
    );
    expect(spaSchema).toContain(
      "@relation(fields: [treatmentId, storeId], references: [id, storeId], onDelete: Cascade)",
    );
  });

  it("stores immutable booking-time treatment facts", () => {
    expect(schema).not.toContain("treatmentNameSnapshot");
    expect(spaSchema).toContain("treatmentNameSnapshot");
    expect(spaSchema).toContain("variantSnapshot");
    expect(spaSchema).toContain("priceSnapshot");
    expect(spaSchema).toContain("serviceMinutes");
    expect(spaSchema).toContain("bufferMinutes");
  });

  it("models weekly availability and dated exceptions without replacing duty assignments", () => {
    expect(schema).toContain("model DutyAssignment {");
    expect(spaSchema).toContain("model SpaStaffAvailability {");
    expect(spaSchema).toContain("model SpaStaffAvailabilityException {");
    expect(spaSchema).toContain("UNAVAILABLE");
    expect(spaSchema).toContain("AVAILABLE");
  });
});
