/**
 * bootstrap-admin.ts — 冪等腳本：建立或升級平台 ADMIN 帳號
 *
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts [email]
 *
 * 預設 email: rock7652@gmail.com
 *
 * 行為：
 *   1. 若 User 不存在 → 建立 ADMIN + 設定臨時密碼
 *   2. 若 User 已是 ADMIN → 確認 passwordHash 存在，否則補上
 *   3. 若 User 是 CUSTOMER 且無營運資料 → 升級為 ADMIN，刪除 Customer record
 *   4. 若 User 是 OWNER/PARTNER → 中止，需手動處理
 *
 * 規則：
 *   - ADMIN 不建立 Staff record
 *   - ADMIN 不綁定任何 store
 *   - ADMIN 不吃 StaffPermission
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const TARGET_EMAIL = process.argv[2] || "rock7652@gmail.com";

function generatePassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

async function main() {
  console.log(`\n=== Bootstrap ADMIN: ${TARGET_EMAIL} ===\n`);

  const existing = await prisma.user.findFirst({
    where: { email: TARGET_EMAIL },
    include: {
      staff: { select: { id: true, storeId: true } },
      customer: {
        select: {
          id: true,
          storeId: true,
          _count: {
            select: {
              bookings: true,
              transactions: true,
              planWallets: true,
              pointRecords: true,
              referralsMade: true,
            },
          },
        },
      },
    },
  });

  // ── Case 1: User 不存在 → 建立 ──
  if (!existing) {
    const password = generatePassword();
    const user = await prisma.user.create({
      data: {
        name: "System Admin",
        email: TARGET_EMAIL,
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash: hashSync(password, 10),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    console.log("Created new ADMIN user:", user);
    console.log(`\n临时密码: ${password}`);
    console.log("请登入 /hq/login 后立即修改密码。\n");
    return;
  }

  // ── Case 2: 已是 ADMIN → 確認密碼 ──
  if (existing.role === "ADMIN") {
    if (existing.passwordHash) {
      console.log("User is already ADMIN with password set. Nothing to do.");
      console.log({ id: existing.id, name: existing.name, role: existing.role });
    } else {
      const password = generatePassword();
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: hashSync(password, 10) },
      });
      console.log("ADMIN user existed but had no password. Password set.");
      console.log(`\n临时密码: ${password}`);
      console.log("请登入 /hq/login 后立即修改密码。\n");
    }
    return;
  }

  // ── Case 3: OWNER / PARTNER → 中止 ──
  if (existing.role === "OWNER" || existing.role === "PARTNER") {
    console.error(
      `ERROR: ${TARGET_EMAIL} is currently ${existing.role} with Staff record.`
    );
    console.error(
      "Upgrading a store OWNER/PARTNER to ADMIN requires manual review."
    );
    console.error("Please handle this manually.");
    process.exit(1);
  }

  // ── Case 4: CUSTOMER → 檢查是否有營運資料 ──
  if (existing.role === "CUSTOMER") {
    const cust = existing.customer;
    if (cust) {
      const hasData =
        cust._count.bookings > 0 ||
        cust._count.transactions > 0 ||
        cust._count.planWallets > 0 ||
        cust._count.pointRecords > 0 ||
        cust._count.referralsMade > 0;

      if (hasData) {
        console.error(
          `ERROR: ${TARGET_EMAIL} is a CUSTOMER with active data (bookings, transactions, etc.)`
        );
        console.error("Cannot auto-upgrade. Please handle manually.");
        process.exit(1);
      }

      // 無營運資料 → 刪除 Customer record
      console.log("Deleting orphaned Customer record (no data):", cust.id);
      await prisma.customer.delete({ where: { id: cust.id } });
    }

    // 升級為 ADMIN
    const password = generatePassword();
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash: hashSync(password, 10),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    console.log("Upgraded CUSTOMER → ADMIN:", updated);
    console.log(`\n临时密码: ${password}`);
    console.log("请登入 /hq/login 后立即修改密码。");
    console.log("注意: Google OAuth 仅用于顾客前台，ADMIN 请用 email + 密码登入。\n");
    return;
  }

  console.error(`Unexpected role: ${existing.role}. Aborting.`);
  process.exit(1);
}

main()
  .catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
