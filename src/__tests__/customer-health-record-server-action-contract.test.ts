import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync(
  resolve(process.cwd(), "src/server/actions/customer-health-record.ts"),
  "utf8",
);

describe("customer health record server action contract", () => {
  it("keeps runtime exports in the use-server module limited to async functions", () => {
    expect(actionSource).toContain('"use server"');
    expect(actionSource).toContain("export async function saveCustomerHealthRecord");
    expect(actionSource).not.toMatch(/export\s+(?:const|let|var|class)\s+/);
  });
});
