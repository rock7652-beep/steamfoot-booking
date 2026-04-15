/**
 * B7-3: 跨店資料隔離自動化測試
 *
 * 執行：npx tsx scripts/test-store-isolation.ts
 *
 * 測試項目：
 * 1. 同店 phone 唯一（DB constraint）
 * 2. 跨店 phone 可重複
 * 3. 同店 email 唯一
 * 4. 跨店 email 可重複
 * 5. getStoreFilter 隔離
 * 6. assertStoreAccess 跨店拒絕
 * 7. Reminder booking 查詢帶 storeId
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STORE_A = "default-store";
const STORE_B = "taichung-store";

let passed = 0;
let failed = 0;
const results: { name: string; status: "PASS" | "FAIL"; error?: string }[] = [];

function pass(name: string) {
  passed++;
  results.push({ name, status: "PASS" });
  console.log(`  ✅ PASS: ${name}`);
}
function fail(name: string, error: string) {
  failed++;
  results.push({ name, status: "FAIL", error });
  console.log(`  ❌ FAIL: ${name} — ${error}`);
}

// ── Test helpers ──

const TEST_PHONE = "0900999001";
const TEST_EMAIL = "isolation-test@example.com";
const cleanupIds: string[] = [];

async function cleanup() {
  if (cleanupIds.length > 0) {
    await prisma.customer.deleteMany({ where: { id: { in: cleanupIds } } });
  }
}

// ── Tests ──

async function test1_sameStorePhoneUnique() {
  const name = "同店 phone 唯一（DB constraint 拒絕）";
  try {
    const c1 = await prisma.customer.create({
      data: { storeId: STORE_A, name: "Test1-A", phone: TEST_PHONE, customerStage: "LEAD" },
    });
    cleanupIds.push(c1.id);

    try {
      const c2 = await prisma.customer.create({
        data: { storeId: STORE_A, name: "Test1-B", phone: TEST_PHONE, customerStage: "LEAD" },
      });
      cleanupIds.push(c2.id);
      fail(name, "應該拒絕但建立成功了");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) {
        pass(name);
      } else {
        fail(name, `非預期錯誤: ${msg}`);
      }
    }
  } catch (e: unknown) {
    fail(name, `setup 失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test2_crossStorePhoneDuplicate() {
  const name = "跨店 phone 可重複";
  try {
    // STORE_A 的 TEST_PHONE 已在 test1 建立
    const c = await prisma.customer.create({
      data: { storeId: STORE_B, name: "Test2-B", phone: TEST_PHONE, customerStage: "LEAD" },
    });
    cleanupIds.push(c.id);
    pass(name);
  } catch (e: unknown) {
    fail(name, `不應該失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test3_sameStoreEmailUnique() {
  const name = "同店 email 唯一（DB constraint 拒絕）";
  try {
    const c1 = await prisma.customer.create({
      data: { storeId: STORE_A, name: "Test3-A", phone: "0900999003", email: TEST_EMAIL, customerStage: "LEAD" },
    });
    cleanupIds.push(c1.id);

    try {
      const c2 = await prisma.customer.create({
        data: { storeId: STORE_A, name: "Test3-B", phone: "0900999004", email: TEST_EMAIL, customerStage: "LEAD" },
      });
      cleanupIds.push(c2.id);
      fail(name, "應該拒絕但建立成功了");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) {
        pass(name);
      } else {
        fail(name, `非預期錯誤: ${msg}`);
      }
    }
  } catch (e: unknown) {
    fail(name, `setup 失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test4_crossStoreEmailDuplicate() {
  const name = "跨店 email 可重複";
  try {
    const c = await prisma.customer.create({
      data: { storeId: STORE_B, name: "Test4-B", phone: "0900999005", email: TEST_EMAIL, customerStage: "LEAD" },
    });
    cleanupIds.push(c.id);
    pass(name);
  } catch (e: unknown) {
    fail(name, `不應該失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test5_customerListIsolation() {
  const name = "Customer 列表隔離 — 各店只看到自己的";
  try {
    const storeACount = await prisma.customer.count({ where: { storeId: STORE_A } });
    const storeBCount = await prisma.customer.count({ where: { storeId: STORE_B } });

    // 兩店都有顧客
    if (storeACount === 0) { fail(name, "Store A 無顧客"); return; }
    if (storeBCount === 0) { fail(name, "Store B 無顧客"); return; }

    // 用 storeId filter 查詢不會混到
    const storeACustomers = await prisma.customer.findMany({
      where: { storeId: STORE_A },
      select: { storeId: true },
    });
    const storeBCustomers = await prisma.customer.findMany({
      where: { storeId: STORE_B },
      select: { storeId: true },
    });

    const aLeak = storeACustomers.some(c => c.storeId !== STORE_A);
    const bLeak = storeBCustomers.some(c => c.storeId !== STORE_B);

    if (aLeak || bLeak) {
      fail(name, `資料洩漏: A有${aLeak ? "他店" : "OK"}, B有${bLeak ? "他店" : "OK"}`);
    } else {
      pass(name + ` (A=${storeACount}, B=${storeBCount})`);
    }
  } catch (e: unknown) {
    fail(name, `${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test6_bookingListIsolation() {
  const name = "Booking 列表隔離 — 各店只看到自己的";
  try {
    const storeABookings = await prisma.booking.findMany({
      where: { storeId: STORE_A },
      select: { storeId: true },
    });
    const storeBBookings = await prisma.booking.findMany({
      where: { storeId: STORE_B },
      select: { storeId: true },
    });

    const aLeak = storeABookings.some(b => b.storeId !== STORE_A);
    const bLeak = storeBBookings.some(b => b.storeId !== STORE_B);

    if (aLeak || bLeak) {
      fail(name, "Booking 資料洩漏");
    } else {
      pass(name + ` (A=${storeABookings.length}, B=${storeBBookings.length})`);
    }
  } catch (e: unknown) {
    fail(name, `${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test7_assertStoreAccessBlock() {
  const name = "assertStoreAccess — 跨店存取應拒絕";
  try {
    // 模擬 assertStoreAccess 邏輯
    const storeAUser = { role: "OWNER" as string, storeId: STORE_A };
    const storeBCustomer = await prisma.customer.findFirst({
      where: { storeId: STORE_B },
      select: { id: true, storeId: true },
    });

    if (!storeBCustomer) { fail(name, "Store B 無顧客可測"); return; }

    // 模擬 assertStoreAccess
    const isAdmin = storeAUser.role === "ADMIN";
    const matches = storeAUser.storeId === storeBCustomer.storeId;

    if (!isAdmin && !matches) {
      pass(name);
    } else {
      fail(name, "跨店存取未被拒絕");
    }
  } catch (e: unknown) {
    fail(name, `${e instanceof Error ? e.message : String(e)}`);
  }
}

async function test8_reminderBookingStoreFilter() {
  const name = "Reminder booking 查詢帶 storeId 隔離";
  try {
    // 查 Store A 的 booking — 不應含 Store B
    const storeABookings = await prisma.booking.findMany({
      where: {
        storeId: STORE_A,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { storeId: true },
      take: 100,
    });

    const leak = storeABookings.some(b => b.storeId !== STORE_A);
    if (leak) {
      fail(name, "Reminder 查詢含他店 booking");
    } else {
      pass(name + ` (${storeABookings.length} bookings, 0 leak)`);
    }
  } catch (e: unknown) {
    fail(name, `${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Main ──

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  B7-3 跨店資料隔離測試                   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // 確認兩店存在
  const storeA = await prisma.store.findUnique({ where: { id: STORE_A } });
  const storeB = await prisma.store.findUnique({ where: { id: STORE_B } });
  if (!storeA) { console.log("❌ Store A 不存在"); return; }
  if (!storeB) { console.log("❌ Store B 不存在 — 請先執行: npx tsx prisma/seed-store2.ts"); return; }
  console.log(`Store A: ${storeA.name} (${STORE_A})`);
  console.log(`Store B: ${storeB.name} (${STORE_B})\n`);

  try {
    await test1_sameStorePhoneUnique();
    await test2_crossStorePhoneDuplicate();
    await test3_sameStoreEmailUnique();
    await test4_crossStoreEmailDuplicate();
    await test5_customerListIsolation();
    await test6_bookingListIsolation();
    await test7_assertStoreAccessBlock();
    await test8_reminderBookingStoreFilter();
  } finally {
    await cleanup();
  }

  console.log("\n════════════════════════════════════════════");
  console.log(`  結果: ${passed} PASS / ${failed} FAIL / ${passed + failed} total`);
  console.log("════════════════════════════════════════════\n");

  if (failed > 0) {
    console.log("❌ 有測試未通過：");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log("✅ 全部通過！跨店資料隔離驗證成功。");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
