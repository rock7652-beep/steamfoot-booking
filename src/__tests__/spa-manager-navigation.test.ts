import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("SPA 店長入口使用正式管理頁", () => {
  const preview = read("src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx");

  it.each([
    ["預約管理", "/spa-schedule"],
    ["顧客管理", "/customers"],
    ["療程管理", "/plans"],
    ["人員管理", "/staff"],
    ["營運設定", "/settings"],
  ])("%s 連到正式頁 %s", (label, route) => {
    expect(preview).toContain(`label: "${label}", path: "${route}"`);
  });

  it("不再顯示縮水工作區或硬編統計數字", () => {
    expect(preview).not.toContain("ManagerWorkspacePanel");
    expect(preview).not.toContain("128 位");
    expect(preview).not.toContain("芳療師管理");
  });

  it("正式管理頁沿用既有完整元件", () => {
    expect(read("src/app/(dashboard)/dashboard/spa-schedule/page.tsx")).toContain("<SpaProviderSchedule");
    expect(read("src/app/(dashboard)/dashboard/customers/page.tsx")).toContain("<CustomersListWithDrawer");
    expect(read("src/app/(dashboard)/dashboard/plans/page.tsx")).toContain("<TreatmentWorkspace");
    expect(read("src/app/(dashboard)/dashboard/staff/page.tsx")).toContain("<StaffWorkspace");
  });
});
