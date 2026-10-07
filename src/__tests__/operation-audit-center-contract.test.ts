import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("unified operation audit center contract", () => {
  it("keeps the read-only permission for HQ access", () => {
    const permissions = read("src/lib/permissions.ts");
    const migration = read("prisma/migrations/20260930081500_add_operation_audit_read_permission/migration.sql");
    expect(permissions).toContain('"audit.read"');
    expect(permissions).toContain('"audit.read": "查看操作紀錄"');
    expect(migration).toContain("s.\"isOwner\" = true");
    expect(migration).toContain("ON CONFLICT");
  });

  it("limits reads to headquarters while preserving selected store scope, filters and pagination", () => {
    const page = read("src/app/(dashboard)/dashboard/operation-audits/page.tsx");
    const layout = read("src/components/dashboard-layout.tsx");
    const sidebar = read("src/components/sidebar.tsx");
    const service = read("src/server/services/operation-audit.ts");
    expect(page).toContain('if (!isStaffRole(user.role)) redirect("/dashboard")');
    expect(page).toContain('if (!user || user.role !== "ADMIN") notFound()');
    expect(page).toContain('const storeId = storeIdForViewContext(activeStoreId, viewContext)');
    expect(page).toContain('checkPermission(user.role, user.staffId, "audit.read")');
    expect(layout).toContain("operation-audits\\/?$");
    expect(page).toContain("storeIdForViewContext");
    expect(page).toContain('module: moduleFilter');
    expect(sidebar.match(/href: "\/dashboard\/operation-audits"/g)).toHaveLength(1);
    expect(service).toContain("pageSize = Math.min");
    expect(service).toContain("createdAt: { gte: input.dateFrom, lte: input.dateTo }");
    expect(service).toContain("skip: (page - 1) * pageSize");
  });

  it("records cross-store viewing with the authenticated actor and both stores", () => {
    const action = read("src/server/actions/store-view-mode.ts");
    expect(action).toContain('action: "VIEW_CROSS_STORE"');
    expect(action).toContain("actorUserId: user.id");
    expect(action).toContain("ownStoreId: user.storeId");
    expect(action).toContain("viewedStoreId: authorizedStore.id");
  });

  it("blocks this preview branch unless both database connections are isolated", () => {
    const migrationGate = read("scripts/ci-migrate.mjs");
    expect(migrationGate).toContain('process.env.VERCEL_GIT_COMMIT_REF === "feat/unified-operation-audit-center"');
    expect(migrationGate).toContain("isIsolatedCourseConnection(process.env.DATABASE_URL)");
    expect(migrationGate).toContain("isIsolatedCourseConnection(process.env.DIRECT_URL)");
  });
});
