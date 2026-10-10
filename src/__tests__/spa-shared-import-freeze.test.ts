import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const sourceRoot = resolve(root, "src");

// Already merged on main in #1232. These adapters dispatch by the authorized
// industry and enforce store/customer scope; customer-care-booking and lifecycle
// tests cover the module boundary. Keep the head-only and merge-ref runs valid.
const REVIEWED_MAIN_CARE_ADAPTERS = [
  "src/app/(dashboard)/dashboard/growth/_components/care-booking-button.tsx",
  "src/server/actions/customer-care-booking.ts",
  "src/server/queries/customer-care-activity.ts",
];
const EXISTING_SHARED_SPA_DEPENDENCIES = [
  ...REVIEWED_MAIN_CARE_ADAPTERS.filter(file => existsSync(resolve(root,file))),
  // Reviewed 2026-09-12: industry-gated home returns before legacy queries;
  // permission and tenant behavior covered by spa-home-boundary.test.ts.
  "src/app/(dashboard)/dashboard/page.tsx",
  // Reviewed 2026-10-06: authenticated read-only preview dispatches by the
  // authorized store module; frontend-preview.test.ts covers scope and write blocking.
  "src/app/frontend-preview/page.tsx",
  // Reviewed 2026-09-12: pure URL normalization, restricted to the exact
  // Preview branch + test endpoint. Production negatives covered by
  // spa-preview-pool.test.ts through the shared buildDatabaseUrl entry point.
  "src/lib/database-url.ts",
  "src/app/(dashboard)/dashboard/bookings/collect-single-modal.tsx",
  "src/app/(dashboard)/dashboard/bookings/new/page.tsx",
  "src/app/(dashboard)/dashboard/bookings/page.tsx",
  "src/app/(dashboard)/dashboard/plans/_components/treatment-workspace.tsx",
  "src/app/(dashboard)/dashboard/plans/page.tsx",
  // Reviewed 2026-09-27: authoritative store module routing before legacy
  // report queries; reports-store-entitlement-gate.test.ts covers all branches.
  "src/app/(dashboard)/dashboard/reports/page.tsx",
  "src/app/(dashboard)/dashboard/staff/page.tsx",
  "src/app/(dashboard)/dashboard/staff/staff-workspace.tsx",
  // Reviewed 2026-09-14: these shared customer/LIFF surfaces select the SPA
  // read/write adapter only after the authoritative store module lookup. The
  // SPA adapter itself enforces exact store membership and never queries the
  // legacy Booking, Transaction or CustomerPlanWallet models.
  "src/app/(customer)/book/page.tsx",
  "src/app/(customer)/book/new/page.tsx",
  "src/app/(customer)/layout.tsx",
  "src/app/(liff)/liff/bookings/bookings-list.tsx",
  "src/app/(liff)/liff/liff-shell.tsx",
  "src/app/(liff)/liff/wallets/wallets-list.tsx",
  "src/app/(liff)/liff/design-preview/booking/page.tsx",
  "src/app/(liff)/liff/design-preview/page.tsx",
  "src/app/(liff)/liff/manager-preview/page.tsx",
  "src/app/(liff)/liff/staff-preview/page.tsx",
  "src/app/(service-workspace)/staff-schedule/page.tsx",
  // HQ has one reviewed SPA boundary: its delivery screen renders the
  // SPA-only provisioning control. The action itself retains HQ permission
  // checks and does not route through legacy booking data.
  "src/app/hq/dashboard/stores/[storeId]/page.tsx",
  "src/lib/digital-butler-entitlement.ts",
  "src/lib/feature-gate.ts",
  "src/lib/permissions.ts",
  "src/lib/store-plan.ts",
  "src/server/actions/booking-drawer.ts",
  // Reviewed 2026-09-27: shared transaction/cashbook plus SPA-only receipts;
  // liff-consumption-boundary.test.ts verifies module and customer/store predicates.
  "src/server/actions/liff-consumption.ts",
  "src/server/actions/staff.ts",
  // Settings receipts resolve the authoritative industry/store. SPA branches
  // use only SpaBooking; shared personnel snapshots never select credentials.
  "src/server/services/staff-save-snapshot.ts",
  "src/server/services/service-hours-save.ts",
  "src/server/services/service-hours-read.ts",
  "src/server/actions/store-onboarding.ts",
  "src/server/queries/booking.ts",
  // Reviewed 2026-09-23: the shared finance adapter first resolves the
  // authoritative store industry, then reads only that store's SPA receipts,
  // sales and refunds. It never mixes SPA rows with legacy transactions.
  "src/server/queries/industry-revenue-mix.ts",
  // Reviewed 2026-09-16: explicit store module gates and storeId filters;
  // trial-care-plans and trial-care-delivery tests cover SPA isolation and
  // COURSE rejection. These adapters were introduced on main, not by courses.
  // Reviewed 2026-10-07: the cross-module audit reader only resolves SPA
  // evidence targets already authorized by audit.read + store scope. It never
  // mutates bookings or routes business operations across modules; the SPA
  // predicate and no-legacy-query assertions live in audit-presentation-scope.
  "src/server/services/audit-presentation.ts",
  "src/server/services/trial-care-plans.ts",
  "src/server/services/trial-care.ts",
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
      // SPA-only API transports are module code, alongside existing spa-* directories.
      // This does not allow SPA imports from other shared routes or services.
      .filter((file) => {
        const path=relative(sourceRoot,file);
        return !path.includes("spa-") && !path.startsWith("app/api/spa/") && !path.includes("/settings-save/spa/");
      })
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /from ["']@\/(?:lib|server\/actions|server\/services|server\/queries)\/spa-|from ["']\.\/spa-/.test(source);
      })
      .map((file) => relative(root, file))
      .sort();

    expect(actual).toEqual(EXISTING_SHARED_SPA_DEPENDENCIES);
  });
});
