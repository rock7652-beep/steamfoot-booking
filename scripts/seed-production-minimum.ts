/**
 * seed-production-minimum.ts — 最小營運 seed（recovery 用）
 *
 * Usage:
 *   npx tsx scripts/seed-production-minimum.ts
 *
 * 行為（idempotent，不刪除任何資料）：
 *   - Store(slug=zhubei)：不改 name，強制 isDefault=true / plan=GROWTH / planStatus=ACTIVE / isDemo=false
 *   - User(passione1220@gmail.com)：若存在 → role=OWNER, status=ACTIVE（不覆蓋密碼/姓名）
 *                                 若不存在 → 建立 OWNER + 臨時密碼
 *   - Staff(userId=該 user)：isOwner=true, status=ACTIVE, storeId=zhubei（**不覆蓋 displayName**）
 *   - StaffPermission：僅當該 staff 的 StaffPermission count = 0 才建立
 *                     （建 26 條 OWNER 預設權限；已有權限保留不動）
 *   - ServicePlan：僅當該 store 的 ServicePlan count = 0 才建立
 *                  單次體驗 / 3堂 / 5堂 / 10堂 / 22堂
 *   - BusinessHours：每個 dayOfWeek 不存在才補建（不覆蓋既有設定）
 *   - ShopConfig：不存在才補建
 *
 * 安全特性：
 *   - 不 TRUNCATE、不刪任何 User（含 LIFF 匿名 user）
 *   - 不覆蓋既有 displayName / password / Store name
 *   - 不動 migration history
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { randomBytes } from "crypto";
import { createDefaultPermissions } from "@/lib/permissions";

const prisma = new PrismaClient();

const STORE_SLUG = "zhubei";
const FALLBACK_STORE_NAME = "竹北店"; // 僅在 store 不存在需要 create 時使用
const FALLBACK_OWNER_NAME = "店長"; // 僅在 user 不存在需要 create 時使用
const FALLBACK_DISPLAY_NAME = "店長"; // 僅在 staff 不存在需要 create 時使用
const OWNER_EMAIL = "passione1220@gmail.com";

type PlanSeed = {
  name: string;
  category: "TRIAL" | "SINGLE" | "PACKAGE";
  price: number;
  sessionCount: number;
  validityDays: number | null;
  sortOrder: number;
  description: string;
};

const PLANS: PlanSeed[] = [
  { name: "單次體驗", category: "TRIAL", price: 500, sessionCount: 1, validityDays: 30, sortOrder: 1, description: "首次體驗價" },
  { name: "3堂", category: "PACKAGE", price: 2100, sessionCount: 3, validityDays: 60, sortOrder: 2, description: "3 堂套餐" },
  { name: "5堂", category: "PACKAGE", price: 3250, sessionCount: 5, validityDays: 90, sortOrder: 3, description: "5 堂套餐" },
  { name: "10堂", category: "PACKAGE", price: 6000, sessionCount: 10, validityDays: 180, sortOrder: 4, description: "10 堂套餐" },
  { name: "22堂", category: "PACKAGE", price: 11000, sessionCount: 22, validityDays: 365, sortOrder: 5, description: "22 堂套餐" },
];

function generatePassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

async function main() {
  console.log("===== seed-production-minimum =====\n");

  // ── 1. Store（不改 name，強制 isDefault=true）────────────
  console.log("1. Upserting store (zhubei)...");
  const existingStore = await prisma.store.findUnique({ where: { slug: STORE_SLUG } });
  const store = await prisma.store.upsert({
    where: { slug: STORE_SLUG },
    update: {
      isDefault: true,
      plan: "GROWTH",
      planStatus: "ACTIVE",
      isDemo: false,
      // 注意：不更新 name
    },
    create: {
      name: FALLBACK_STORE_NAME,
      slug: STORE_SLUG,
      plan: "GROWTH",
      planStatus: "ACTIVE",
      isDefault: true,
      isDemo: false,
    },
  });
  if (existingStore) {
    console.log(`   updated store.id=${store.id} | name=「${store.name}」(保留) | isDefault=${store.isDefault} | plan=${store.plan}`);
  } else {
    console.log(`   created store.id=${store.id} | name=「${store.name}」 | isDefault=${store.isDefault} | plan=${store.plan}`);
  }

  // ── 2. User（passione1220 → OWNER）───────────────────────
  console.log("\n2. Upserting owner user...");
  const existingUser = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });

  let tempPassword: string | null = null;
  let user;
  if (!existingUser) {
    tempPassword = generatePassword();
    user = await prisma.user.create({
      data: {
        name: FALLBACK_OWNER_NAME,
        email: OWNER_EMAIL,
        role: "OWNER",
        status: "ACTIVE",
        passwordHash: hashSync(tempPassword, 10),
      },
    });
    console.log(`   created user.id=${user.id} | role=OWNER | name=「${user.name}」`);
  } else {
    const updates: { role?: "OWNER"; status?: "ACTIVE" } = {};
    if (existingUser.role !== "OWNER") updates.role = "OWNER";
    if (existingUser.status !== "ACTIVE") updates.status = "ACTIVE";
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: existingUser.id }, data: updates });
      console.log(`   updated user.id=${user.id} | role: ${existingUser.role} → ${user.role} | status: ${existingUser.status} → ${user.status}`);
    } else {
      user = existingUser;
      console.log(`   user.id=${user.id} 已是 OWNER/ACTIVE，無變更`);
    }
    if (!existingUser.passwordHash) {
      console.log(`   ⚠️  此 user 沒有 passwordHash — 若要用 email+password 登入後台，請另以 bootstrap-admin 或自行設定密碼`);
    }
    if (existingUser.name !== FALLBACK_OWNER_NAME) {
      console.log(`   （保留既有 user.name=「${existingUser.name}」）`);
    }
  }

  // ── 3. Staff（綁 zhubei、isOwner=true、ACTIVE；不覆蓋 displayName）──
  console.log("\n3. Upserting staff...");
  const existingStaff = await prisma.staff.findUnique({ where: { userId: user.id } });
  const staff = await prisma.staff.upsert({
    where: { userId: user.id },
    update: {
      storeId: store.id,
      isOwner: true,
      status: "ACTIVE",
      // 注意：不更新 displayName
    },
    create: {
      userId: user.id,
      storeId: store.id,
      displayName: FALLBACK_DISPLAY_NAME,
      colorCode: "#6366f1",
      isOwner: true,
      status: "ACTIVE",
    },
  });
  if (existingStaff) {
    console.log(`   updated staff.id=${staff.id} | display=「${staff.displayName}」(保留) | isOwner=${staff.isOwner} | status=${staff.status} | storeId=${staff.storeId}`);
  } else {
    console.log(`   created staff.id=${staff.id} | display=「${staff.displayName}」 | isOwner=${staff.isOwner}`);
  }

  // ── 3.5 StaffPermission（僅當為 0 時補 OWNER 預設權限）──
  console.log("\n3.5 StaffPermission（僅當為 0 補建 OWNER 預設權限）...");
  const existingPermCount = await prisma.staffPermission.count({ where: { staffId: staff.id } });
  if (existingPermCount === 0) {
    await createDefaultPermissions(staff.id, "OWNER");
    const grantedCount = await prisma.staffPermission.count({
      where: { staffId: staff.id, granted: true },
    });
    console.log(`   ✓ 補 OWNER 預設權限完成（granted=${grantedCount}）`);
  } else {
    console.log(`   既有 ${existingPermCount} 條 StaffPermission，保留不動`);
  }

  // ── 4. ServicePlan（僅當該 store 為 0 時建立）─────────────
  console.log("\n4. ServicePlan...");
  const planCount = await prisma.servicePlan.count({ where: { storeId: store.id } });
  if (planCount > 0) {
    console.log(`   既有 ${planCount} 個方案，跳過建立`);
  } else {
    for (const p of PLANS) {
      await prisma.servicePlan.create({
        data: {
          storeId: store.id,
          name: p.name,
          category: p.category,
          price: p.price,
          sessionCount: p.sessionCount,
          validityDays: p.validityDays,
          sortOrder: p.sortOrder,
          description: p.description,
          isActive: true,
        },
      });
      console.log(`   ✓ ${p.name} (${p.category}) NT$${p.price}`);
    }
  }

  // ── 5. BusinessHours（每個 dow 不存在才補建）──────────────
  console.log("\n5. BusinessHours（缺的補上，已存在保留）...");
  let bhCreated = 0;
  let bhKept = 0;
  for (let dow = 0; dow < 7; dow++) {
    const exist = await prisma.businessHours.findUnique({
      where: { storeId_dayOfWeek: { storeId: store.id, dayOfWeek: dow } },
    });
    if (exist) {
      bhKept++;
      continue;
    }
    await prisma.businessHours.create({
      data: {
        storeId: store.id,
        dayOfWeek: dow,
        isOpen: true,
        openTime: "10:00",
        closeTime: "21:00",
        slotInterval: 60,
        defaultCapacity: 6,
      },
    });
    bhCreated++;
  }
  console.log(`   created=${bhCreated}, kept=${bhKept} (共 7 天)`);

  // ── 6. ShopConfig（不存在才補建）──────────────────────────
  console.log("\n6. ShopConfig（不存在才補建）...");
  const existingShopConfig = await prisma.shopConfig.findUnique({ where: { storeId: store.id } });
  if (existingShopConfig) {
    console.log(`   既有 ShopConfig（id=${existingShopConfig.id}），保留不動`);
  } else {
    const shopConfig = await prisma.shopConfig.create({
      data: {
        storeId: store.id,
        shopName: store.name,
        dutySchedulingEnabled: false,
      },
    });
    console.log(`   created shopConfig.id=${shopConfig.id}`);
  }

  // ── 7. 驗收 ──────────────────────────────────────────────
  console.log("\n===== 驗收 =====");
  const counts = {
    Store: await prisma.store.count(),
    User: await prisma.user.count(),
    Staff: await prisma.staff.count(),
    "StaffPermission(芊芊店長)": await prisma.staffPermission.count({ where: { staffId: staff.id } }),
    "StaffPermission granted(芊芊店長)": await prisma.staffPermission.count({
      where: { staffId: staff.id, granted: true },
    }),
    ServicePlan: await prisma.servicePlan.count(),
    "ServicePlan(zhubei)": await prisma.servicePlan.count({ where: { storeId: store.id } }),
    BusinessHours: await prisma.businessHours.count({ where: { storeId: store.id } }),
    ShopConfig: await prisma.shopConfig.count({ where: { storeId: store.id } }),
  };
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k}: ${v}`);
  }

  if (tempPassword) {
    console.log("\n=================================================");
    console.log("⚠️  本次新建 user，臨時密碼（首次登入後請立即修改）：");
    console.log(`   email: ${OWNER_EMAIL}`);
    console.log(`   password: ${tempPassword}`);
    console.log("=================================================\n");
  }

  console.log("✅ seed-production-minimum 完成");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
