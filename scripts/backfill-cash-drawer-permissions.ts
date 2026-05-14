/**
 * backfill-cash-drawer-permissions.ts — 補 cashDrawer.* 預設權限給既有 staff
 *
 * 背景：PR-2 加了 4 個 cashDrawer.* permission keys，PR-3 把它們從 DEFAULT
 * OWNER / PARTNER 暫時拿掉避免新 staff 自動拿到半套功能，PR-5 ship 後（含本
 * commit）已恢復 default。但 `createDefaultPermissions()` 只在「新建 staff」時
 * 才會跑，既有 staff 不會自動補。此 script 對所有既有 staff 重跑該函式。
 *
 * 安全性：
 *   - 使用 createMany({ skipDuplicates: true })：既有 StaffPermission row 不被改動
 *   - 只新增缺的 keys；已有 granted=false 的 row 不會升級為 granted=true
 *   - Default 為 DRY-RUN（不寫入）；必須明確加 --apply 才寫入
 *   - 如何回滾：手動到 staff edit UI 取消勾選即可（StaffPermission 表）
 *
 * Usage:
 *   # 1. DRY RUN（預設）— 列出每個 staff 缺哪些 cashDrawer.* 權限
 *   npx tsx scripts/backfill-cash-drawer-permissions.ts
 *
 *   # 2. 真實寫入（須再次確認）
 *   npx tsx scripts/backfill-cash-drawer-permissions.ts --apply
 *
 *   # 3. 限定 role（避免一次處理所有）
 *   npx tsx scripts/backfill-cash-drawer-permissions.ts --role OWNER
 *
 *   # 4. JSON 輸出（方便 archive）
 *   npx tsx scripts/backfill-cash-drawer-permissions.ts --apply --json > backfill.json
 */

import { PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  getDefaultPermissionsForRole,
  type PermissionCode,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

// ============================================================
// CLI args
// ============================================================

const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");

function parseFlagValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}
const ROLE_FILTER = parseFlagValue("--role"); // "OWNER" | "PARTNER" | null

const CASH_DRAWER_KEYS = [
  "cashDrawer.read",
  "cashDrawer.open",
  "cashDrawer.close",
  "cashDrawer.entry",
] as const satisfies readonly PermissionCode[];

// ============================================================
// Main
// ============================================================

async function main() {
  if (!JSON_OUT) {
    console.log("=".repeat(60));
    console.log(`Mode: ${APPLY ? "APPLY (will write to DB)" : "DRY RUN (no write)"}`);
    if (ROLE_FILTER) console.log(`Role filter: ${ROLE_FILTER}`);
    console.log("=".repeat(60));
  }

  // 找所有有 Staff record 的 user
  const staffs = await prisma.staff.findMany({
    where: ROLE_FILTER ? { user: { role: ROLE_FILTER as never } } : undefined,
    select: {
      id: true,
      user: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  type StaffReport = {
    staffId: string;
    userName: string;
    role: string;
    currentCashDrawerGranted: PermissionCode[];
    missingCashDrawer: PermissionCode[];
    wouldBeAddedAsGranted: PermissionCode[];
    wouldBeAddedAsNotGranted: PermissionCode[];
  };

  const reports: StaffReport[] = [];

  for (const s of staffs) {
    const role = s.user.role;
    if (role !== "OWNER" && role !== "PARTNER") continue; // ADMIN 不需要 StaffPermission rows

    const defaults = getDefaultPermissionsForRole(role as never);
    const existing = await prisma.staffPermission.findMany({
      where: { staffId: s.id, permission: { in: [...ALL_PERMISSIONS] } },
      select: { permission: true, granted: true },
    });
    const existingKeys = new Set(existing.map((e) => e.permission));
    const currentCashDrawerGranted = existing
      .filter((e) => e.granted && (CASH_DRAWER_KEYS as readonly string[]).includes(e.permission))
      .map((e) => e.permission as PermissionCode);
    const missingCashDrawer = CASH_DRAWER_KEYS.filter((k) => !existingKeys.has(k));

    const wouldBeAddedAsGranted = ALL_PERMISSIONS.filter(
      (k) => !existingKeys.has(k) && defaults.includes(k),
    );
    const wouldBeAddedAsNotGranted = ALL_PERMISSIONS.filter(
      (k) => !existingKeys.has(k) && !defaults.includes(k),
    );

    reports.push({
      staffId: s.id,
      userName: s.user.name,
      role: role,
      currentCashDrawerGranted,
      missingCashDrawer: [...missingCashDrawer],
      wouldBeAddedAsGranted,
      wouldBeAddedAsNotGranted,
    });
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ apply: APPLY, reports }, null, 2));
  } else {
    for (const r of reports) {
      console.log("");
      console.log(`Staff: ${r.userName} (${r.role}) — ${r.staffId}`);
      console.log(`  cashDrawer.* 已 granted：${r.currentCashDrawerGranted.join(", ") || "（無）"}`);
      console.log(`  cashDrawer.* 表中缺少：${r.missingCashDrawer.join(", ") || "（無）"}`);
      console.log(`  將新增（granted=true）：${r.wouldBeAddedAsGranted.join(", ") || "（無）"}`);
      console.log(`  將新增（granted=false）：${r.wouldBeAddedAsNotGranted.join(", ") || "（無）"}`);
    }
  }

  if (APPLY) {
    if (!JSON_OUT) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Applying changes...");
      console.log("=".repeat(60));
    }
    for (const r of reports) {
      const defaults = getDefaultPermissionsForRole(r.role as never);
      const data = ALL_PERMISSIONS.map((perm) => ({
        staffId: r.staffId,
        permission: perm,
        granted: defaults.includes(perm),
      }));
      const result = await prisma.staffPermission.createMany({
        data,
        skipDuplicates: true,
      });
      if (!JSON_OUT) {
        console.log(`  ${r.userName} (${r.role}): created ${result.count} rows`);
      }
    }
    if (!JSON_OUT) console.log("Done.");
  } else if (!JSON_OUT) {
    console.log("");
    console.log("=".repeat(60));
    console.log("DRY RUN — no changes written.");
    console.log("Run with --apply to actually write.");
    console.log("=".repeat(60));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
