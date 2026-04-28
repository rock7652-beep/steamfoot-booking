/**
 * diagnose-staff-perms.ts — 純讀取（無寫入）
 *
 * 確認芊芊店長 staff 是否有 StaffPermission 列。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("===== StaffPermission Diagnosis (READ-ONLY) =====\n");

  const staff = await prisma.staff.findMany({
    include: {
      user: { select: { email: true, role: true } },
      permissions: { select: { permission: true, granted: true } },
    },
  });

  for (const s of staff) {
    console.log(`Staff: ${s.displayName} (id=${s.id})`);
    console.log(`  user: ${s.user.email ?? "(no email)"} role=${s.user.role}`);
    console.log(`  isOwner=${s.isOwner} status=${s.status}`);
    console.log(`  StaffPermission rows: ${s.permissions.length}`);
    if (s.permissions.length > 0) {
      const granted = s.permissions.filter((p) => p.granted).map((p) => p.permission);
      const denied = s.permissions.filter((p) => !p.granted).map((p) => p.permission);
      console.log(`    granted (${granted.length}): ${granted.join(", ") || "(none)"}`);
      if (denied.length > 0) {
        console.log(`    denied (${denied.length}): ${denied.join(", ")}`);
      }
    }
  }

  console.log("\n===== Done (no writes) =====");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
