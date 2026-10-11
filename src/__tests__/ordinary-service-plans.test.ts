import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectOrdinaryServicePlans } from "@/lib/ordinary-service-plans";

describe("ordinary service plan choices", () => {
  it("excludes active/inactive TRIAL by category and preserves ordinary rows and order", () => {
    const rows = [
      { id: "trial", category: "TRIAL", isActive: true, name: "體驗課" },
      { id: "single", category: "SINGLE", isActive: true, name: "單次" },
      { id: "old-trial", category: "TRIAL", isActive: false, name: "舊體驗" },
      { id: "package", category: "PACKAGE", isActive: false, name: "體驗課" },
    ];
    const selected = selectOrdinaryServicePlans(rows);
    expect(selected).toEqual([rows[1], rows[3]]);
    expect(selected[0]).toBe(rows[1]);
    expect(rows).toHaveLength(4);
    expect(selectOrdinaryServicePlans([])).toEqual([]);
  });

  it.each([
    "src/app/(dashboard)/dashboard/plans/page.tsx",
    "src/app/(dashboard)/dashboard/customers/page.tsx",
    "src/app/(dashboard)/dashboard/customers/[id]/page.tsx",
  ])("filters only the ordinary presentation boundary in %s", (path) => {
    expect(readFileSync(path, "utf8")).toContain(".then(selectOrdinaryServicePlans)");
  });

  it("does not alter the shared raw plan reads or historical booking filter", () => {
    for (const path of ["src/lib/query-cache.ts", "src/server/queries/plan.ts", "src/app/(dashboard)/dashboard/bookings/page.tsx"]) {
      expect(readFileSync(path, "utf8")).not.toContain("selectOrdinaryServicePlans");
    }
  });

  it("removes ordinary TRIAL creation choices and rejects a retained old draft explicitly", () => {
    const drawer = readFileSync("src/app/(dashboard)/dashboard/plans/_components/plan-form-drawer.tsx", "utf8");
    expect(drawer).toContain('if (!isEdit && category === "TRIAL")');
    expect(drawer).toContain('<option value="TRIAL" disabled>請重新選擇類別</option>');
    expect(readFileSync("src/app/(dashboard)/dashboard/plans/new/page.tsx", "utf8")).not.toContain('<option value="TRIAL">');
    const manager = readFileSync("src/app/(dashboard)/dashboard/plans/_components/plans-manager.tsx", "utf8");
    expect(manager).not.toContain('["all", "TRIAL", "SINGLE", "PACKAGE"]');
    expect(manager).toContain('["all", "SINGLE", "PACKAGE"]');
  });
});
