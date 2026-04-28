/**
 * diagnose-db-identity.ts — 純讀取（無寫入）
 *
 * 在 diagnose-db-state 之後，進一步查現有 Store / User / Staff 是哪些，
 * 用以判斷 baseline / seed 的安全性。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("===== Identity Diagnosis (READ-ONLY) =====\n");

  console.log("1. Stores:");
  const stores = await prisma.$queryRaw<
    Array<{ id: string; name: string; slug: string; plan: string; isDefault: boolean; isDemo: boolean; createdAt: Date }>
  >`SELECT id, name, slug, plan::text AS plan, "isDefault", "isDemo", "createdAt" FROM "Store" ORDER BY "createdAt"`;
  for (const s of stores) {
    console.log(`   - id=${s.id} | slug=${s.slug} | name=${s.name} | plan=${s.plan} | isDefault=${s.isDefault} | isDemo=${s.isDemo} | created=${s.createdAt.toISOString()}`);
  }

  console.log("\n2. Users (email + role + status + created):");
  const users = await prisma.$queryRaw<
    Array<{ id: string; email: string | null; name: string; role: string; status: string; hasPassword: boolean; createdAt: Date }>
  >`SELECT id, email, name, role::text AS role, status::text AS status, ("passwordHash" IS NOT NULL) AS "hasPassword", "createdAt" FROM "User" ORDER BY "createdAt"`;
  for (const u of users) {
    console.log(`   - ${u.email ?? "(no email)"} | role=${u.role} | status=${u.status} | pw=${u.hasPassword ? "set" : "(none)"} | name=${u.name} | created=${u.createdAt.toISOString().slice(0, 10)}`);
  }

  console.log("\n3. Staff:");
  const staff = await prisma.$queryRaw<
    Array<{ id: string; userId: string; storeId: string; displayName: string; isOwner: boolean; status: string }>
  >`SELECT id, "userId", "storeId", "displayName", "isOwner", status::text AS status FROM "Staff"`;
  for (const s of staff) {
    console.log(`   - id=${s.id} | userId=${s.userId} | storeId=${s.storeId} | display=${s.displayName} | isOwner=${s.isOwner} | status=${s.status}`);
  }

  // 對照 staff.userId → user.email
  if (staff.length > 0) {
    console.log("\n   Staff ↔ User cross-ref:");
    for (const s of staff) {
      const u = users.find((x) => x.id === s.userId);
      console.log(`     staff ${s.displayName} → user ${u?.email ?? "(missing)"} (role=${u?.role ?? "?"})`);
    }
  }

  console.log("\n4. 是否已有 passione1220@gmail.com?");
  const target = users.find((u) => u.email === "passione1220@gmail.com");
  if (target) {
    console.log(`   ✅ 已存在: id=${target.id} role=${target.role} status=${target.status} pw=${target.hasPassword ? "set" : "(none)"}`);
  } else {
    console.log("   ❌ 不存在於現有 13 位 User 中");
  }

  console.log("\n===== Done (no writes performed) =====");
}

main()
  .catch((e) => {
    console.error("diagnose failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
