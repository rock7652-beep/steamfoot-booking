import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const action = readFileSync("src/server/actions/liff-health.ts", "utf8");
const history = readFileSync("src/components/health-history-list.tsx", "utf8");
const form = readFileSync(
  "src/app/(customer)/health/new/health-record-form.tsx",
  "utf8",
);

describe("LIFF customer health record editing contract", () => {
  it("shows an edit entry only for native records carrying an owned record id", () => {
    expect(history).toContain("editBasePath && recordId");
    expect(history).toContain("/${recordId}/edit");
  });

  it("updates only a record inside the signed-in customer's verified memberships", () => {
    expect(action).toContain("resolveCentralMembershipsForUser(user.id)");
    expect(action).toContain("where: { id: recordId, OR: scopes }");
    expect(action).toContain('user.role !== "CUSTOMER"');
    expect(action).not.toContain("updateMany({");
  });

  it("reuses validation and pre-fills every editable measurement", () => {
    expect(action).toContain("healthRecordInputSchema.safeParse");
    expect(form).toContain('mode === "edit"');
    expect(form).toContain("defaultValue={initialValues?.[name] ?? \"\"}");
    expect(form).toContain("defaultValue={initialValues?.measuredAt ?? today}");
  });
});
