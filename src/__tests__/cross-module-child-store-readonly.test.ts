import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("cross-module child-store read-only contract", () => {
  it("keeps course reads separate from the write-store resolver", () => {
    const access = source("src/server/services/course-access.ts");
    const readHelper = access.slice(access.indexOf("export async function courseManagerRead"));
    expect(readHelper).toContain("getActiveStoreForRead(user)");
    expect(readHelper).toContain("isChildStoreView");
    expect(readHelper).not.toContain("resolveWriteStoreId(user)");
  });

  it("keeps SPA reads separate from resource mutations", () => {
    const access = source("src/server/actions/spa-resources.ts");
    expect(access).toContain("export async function spaResourceStoreRead");
    expect(access).toContain("getActiveStoreForRead(user)");
    expect(source("src/app/(dashboard)/dashboard/spa-resources/page.tsx")).toContain("readOnly={isChildStoreView}");
    expect(source("src/app/(dashboard)/dashboard/spa-staff/page.tsx")).toContain("readOnly={isChildStoreView}");
  });

  it("turns off course management controls while viewing a child store", () => {
    const hours = source("src/app/(dashboard)/dashboard/courses/hours/page.tsx");
    const staff = source("src/app/(dashboard)/dashboard/courses/staff-page.tsx");
    expect(hours).toContain("isChildStoreView?Promise.resolve(false)");
    expect(staff).toContain("isChildStoreView ? Promise.resolve(false)");
    expect(staff).toContain("canManage={canManage}");
  });
});
