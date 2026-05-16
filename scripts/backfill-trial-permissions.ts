/**
 * backfill-trial-permissions.ts — 補 trial.* 預設權限給既有 staff
 *
 * 背景：體驗客流程 PR-1 新增 5 個 trial.* permission keys，並加入 DEFAULT
 * OWNER（全 5）/ PARTNER（trial.read, trial.create）。但
 * `createDefaultPermissions()` 只在「新建 staff」時才跑，既有 staff 不會自動補。
 * 此 script 對所有既有 staff 依角色 default 補齊缺少的 permission rows。
 *
 * 安全性：
 *   - 使用 createMany({ skipDuplicates: true })：既有 StaffPermission row 不被改動
 *   - 只新增缺的 keys；已有 granted=false 的 row 不會升級為 granted=true
 *   - Default 為 DRY-RUN（不寫入）；必須明確加 --apply 才寫入
 *   - 如何回滾：手動到 staff edit UI 取消勾選即可（StaffPermission 表）
 *
 * Usage:
 *   npx tsx scripts/backfill-trial-permissions.ts                 # DRY RUN
 *   npx tsx scripts/backfill-trial-permissions.ts --apply         # 真實寫入
 *   npx tsx scripts/backfill-trial-permissions.ts --role OWNER    # 限定 role
 *   npx tsx scripts/backfill-trial-permissions.ts --apply --json > backfill.json
 */

import { PrismaClient } from "@prisma/client";
import {
  ALL_PERMISSIONS,
  getDefaultPermissionsForRole,
  type PermissionCode,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");

function parseFlagValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}
const ROLE_FILTER = parseFlagValue("--role"); // "OWNER" | "PARTNER" | null

const TRIAL_KEYS = [
  "trial.read",
  "trial.create",
  "trial.confirm",
  "trial.cancel",
  "trial.manage",
] as const satisfies readonly PermissionCode[];

async function main() {
  if (!JSON_OUT) {
    console.log("=".repeat(60));
    console.log(`Mode: ${APPLY ? "APPLY (will write to DB)" : "DRY RUN (no write)"}`);
    if (ROLE_FILTER) console.log(`Role filter: ${ROLE_FILTER}`);
    console.log("=".repeat(60));
  }

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
    currentTrialGranted: PermissionCode[];
    missingTrial: PermissionCode[];
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
    const currentTrialGranted = existing
      .filter((e) => e.granted && (TRIAL_KEYS as readonly string[]).includes(e.permission))
      .map((e) => e.permission as PermissionCode);
    const missingTrial = TRIAL_KEYS.filter((k) => !existingKeys.has(k));

    const wouldBeAddedAsGranted = ALL_PERMISSIONS.filter(
      (k) => !existingKeys.has(k) && defaults.includes(k),
    );
    const wouldBeAddedAsNotGranted = ALL_PERMISSIONS.filter(
      (k) => !existingKeys.has(k) && !defaults.includes(k),
    );

    reports.push({
      staffId: s.id,
      userName: s.user.name,
      role,
      currentTrialGranted,
      missingTrial: [...missingTrial],
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
      console.log(`  trial.* 已 granted：${r.currentTrialGranted.join(", ") || "（無）"}`);
      console.log(`  trial.* 表中缺少：${r.missingTrial.join(", ") || "（無）"}`);
      console.log(`  將新增（granted=true）：${r.wouldBeAddedAsGranted.join(", ") || "（無）"}`);
      console.log(`  將新增（granted=false）：${r.wouldBeAddedAsNotGranted.join(", ") || "（無）"}`);
    }
  }

  if (APPLY) {
    if (!JSON_OUT) {
      console.log("");
      console.log("Applying changes...");
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
    console.log("DRY RUN — no changes written. Run with --apply to actually write.");
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
