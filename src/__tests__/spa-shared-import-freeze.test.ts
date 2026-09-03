import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const sourceRoot = resolve(root, "src");

const EXISTING_SHARED_SPA_DEPENDENCIES = [
  "src/app/(dashboard)/dashboard/bookings/collect-single-modal.tsx",
  "src/app/(dashboard)/dashboard/bookings/new/page.tsx",
  "src/app/(dashboard)/dashboard/bookings/page.tsx",
  "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx",
  "src/app/(dashboard)/dashboard/plans/page.tsx",
  "src/app/(dashboard)/dashboard/settings/hours/page.tsx",
  "src/app/(dashboard)/dashboard/settings/page.tsx",
  "src/app/(dashboard)/dashboard/staff/[id]/edit/page.tsx",
  "src/app/(dashboard)/dashboard/staff/page.tsx",
  "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
  "src/app/(liff)/liff/design-preview/booking/page.tsx",
  "src/app/(liff)/liff/design-preview/page.tsx",
  "src/app/(liff)/liff/manager-preview/page.tsx",
  "src/app/(liff)/liff/staff-preview/page.tsx",
  "src/app/(service-workspace)/staff-schedule/page.tsx",
  "src/lib/digital-butler-entitlement.ts",
  "src/lib/feature-gate.ts",
  "src/lib/permissions.ts",
  "src/lib/store-plan.ts",
  "src/server/actions/booking-drawer.ts",
  "src/server/actions/staff.ts",
  "src/server/queries/booking.ts",
].sort();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (entry === "__tests__") return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("SPA imports in shared Steamfoot code", () => {
  it("freezes the existing debt so no new shared file can import SPA code", () => {
    const actual = sourceFiles(sourceRoot)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !relative(sourceRoot, file).includes("spa-"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /from ["']@\/(?:lib|server\/actions|server\/services|server\/queries)\/spa-|from ["']\.\/spa-/.test(source);
      })
      .map((file) => relative(root, file))
      .sort();

    expect(actual).toEqual(EXISTING_SHARED_SPA_DEPENDENCIES);
  });
});
