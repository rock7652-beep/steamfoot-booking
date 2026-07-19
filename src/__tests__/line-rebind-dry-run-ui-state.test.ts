import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/dashboard/customers/[id]/line-binding-section.tsx"), "utf8");

describe("LINE rebind dry-run UI state", () => {
  it("clears dry-run state whenever the active request changes", () => {
    expect(source).toContain("}, [activeLineRebindRequest?.id]);");
    expect(source).toContain("setDryRun(null);");
  });

  it("renders a dry-run only when it belongs to the active request", () => {
    expect(source).toContain("const activeDryRun = dryRun?.requestId === activeLineRebindRequest?.id ? dryRun : null;");
    expect(source).toContain("{activeDryRun &&");
  });
});
