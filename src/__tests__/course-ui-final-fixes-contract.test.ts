import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("course UI final fixes", () => {
  it("keeps customer actions compact and removes LINE name from course search prompts", () => {
    const table = read("src/app/(dashboard)/dashboard/customers/_components/customers-table.tsx");
    const toolbar = read("src/app/(dashboard)/dashboard/customers/_components/customers-toolbar.tsx");
    const picker = read("src/components/admin/course-customer-picker.tsx");

    expect(table).toContain('"h-8 min-w-14 whitespace-nowrap text-xs"');
    expect(toolbar).toContain('placeholder="搜尋姓名／電話"');
    expect(picker).toContain('placeholder="搜尋姓名／電話"');
  });

  it("separates plan products from held plans and keeps assignment with held plans", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/member-workspace.tsx");
    expect(workspace).toContain("方案商品");
    expect(workspace).toContain("顧客持有方案");
    expect(workspace).toContain('planArea === "cards"');
    expect(workspace).toContain("單位價格");
  });

  it("shows textual session states in addition to color", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/workspace.tsx");
    for (const label of ["未開始", "進行中", "待點名", "已完成", "未到", "已結束"]) {
      expect(workspace).toContain(label);
    }
  });
});
