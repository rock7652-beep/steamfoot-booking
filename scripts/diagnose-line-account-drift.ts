/**
 * diagnose-line-account-drift.ts — READ-ONLY
 *
 * 找出歷史資料中「Customer.lineUserId 已綁，但 NextAuth Account[line] 缺失」的人。
 *
 * 為什麼會有 drift：
 *   webhook 綁定碼 / resolveLineLogin / finalizeLineBind / mergePlaceholder
 *   過去都只 update Customer.lineUserId 沒同步 Account。下次 LINE OAuth 若因
 *   storeId / cookie 等因素 miss 既有 Customer，就會走新身份建立流程，造成分裂。
 *   Hotfix 已在新 bind 寫入點補同步，但歷史資料需要這支腳本找出來再 backfill。
 *
 * 用法：
 *   npx tsx scripts/diagnose-line-account-drift.ts             # 列全部 drift
 *   npx tsx scripts/diagnose-line-account-drift.ts --count     # 只算數量
 *   npx tsx scripts/diagnose-line-account-drift.ts --store=zhubei  # 限店
 *
 * 不會 update DB。輸出可作為 backfill 腳本（另寫）的輸入。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COUNT_ONLY = process.argv.includes("--count");
const storeFilterArg = process.argv.find((a) => a.startsWith("--store="));
const STORE_SLUG_FILTER = storeFilterArg?.split("=")[1] ?? null;

type DriftRow = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  storeId: string;
  storeSlug: string;
  userId: string;
  lineUserId: string;
  hasUserPassword: boolean;
  reason:
    | "no_account_at_all"
    | "account_linked_to_other_user"
    | "account_exists_correct_user"; // 不是 drift（不應出現在最終列表）
  existingAccountUserId: string | null;
};

async function main() {
  console.log("===== LINE Account Drift Diagnostic (READ-ONLY) =====\n");

  const stores = await prisma.store.findMany({
    select: { id: true, slug: true, name: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s] as const));

  let storeIdFilter: string | null = null;
  if (STORE_SLUG_FILTER) {
    const s = stores.find((x) => x.slug === STORE_SLUG_FILTER);
    if (!s) {
      console.error(`❌ Store with slug=${STORE_SLUG_FILTER} not found.`);
      process.exit(1);
    }
    storeIdFilter = s.id;
    console.log(`Filtering to store: ${s.slug} (${s.name})\n`);
  }

  // 候選：Customer.lineUserId 與 userId 皆有值，且未被合併歸檔
  const candidates = await prisma.customer.findMany({
    where: {
      lineUserId: { not: null },
      userId: { not: null },
      mergedIntoCustomerId: null,
      ...(storeIdFilter ? { storeId: storeIdFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      storeId: true,
      userId: true,
      lineUserId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Candidate Customers (lineUserId + userId 皆有): ${candidates.length}\n`);

  const drifts: DriftRow[] = [];

  for (const c of candidates) {
    if (!c.lineUserId || !c.userId) continue; // type narrow

    const acct = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "line",
          providerAccountId: c.lineUserId,
        },
      },
      select: { id: true, userId: true },
    });

    if (acct && acct.userId === c.userId) {
      continue; // 已對齊，不是 drift
    }

    const user = await prisma.user.findUnique({
      where: { id: c.userId },
      select: { passwordHash: true },
    });

    drifts.push({
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      storeId: c.storeId,
      storeSlug: storeMap.get(c.storeId)?.slug ?? "?",
      userId: c.userId,
      lineUserId: c.lineUserId,
      hasUserPassword: !!user?.passwordHash,
      reason: !acct ? "no_account_at_all" : "account_linked_to_other_user",
      existingAccountUserId: acct?.userId ?? null,
    });
  }

  // ─── 分組統計 ─────────────────────────────────────────
  console.log("──── 結果 ────");
  console.log(`Drift 總數：${drifts.length}`);
  const byReason = drifts.reduce(
    (acc, d) => {
      acc[d.reason] = (acc[d.reason] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`  - ${reason}: ${count}`);
  }
  const byStore = drifts.reduce(
    (acc, d) => {
      acc[d.storeSlug] = (acc[d.storeSlug] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log(`\n依店分佈：`);
  for (const [slug, count] of Object.entries(byStore)) {
    console.log(`  - ${slug}: ${count}`);
  }
  console.log();

  if (COUNT_ONLY) {
    console.log("(--count specified, 不列明細)");
    return;
  }

  if (drifts.length === 0) {
    console.log("✓ 沒有 drift，所有 Customer.lineUserId 與 Account[line] 已對齊。");
    return;
  }

  // ─── 明細表 ───────────────────────────────────────────
  console.log("──── 明細 ────");
  for (const d of drifts) {
    console.log(
      `\n  Customer.id=${d.customerId}\n` +
        `    name=${d.customerName}\n` +
        `    phone=${d.customerPhone}\n` +
        `    store=${d.storeSlug}\n` +
        `    Customer.userId=${d.userId}\n` +
        `    Customer.lineUserId=${d.lineUserId}\n` +
        `    User.hasPassword=${d.hasUserPassword}\n` +
        `    reason=${d.reason}` +
        (d.existingAccountUserId
          ? ` (existing Account.userId=${d.existingAccountUserId})`
          : ""),
    );
  }
  console.log();

  // ─── 建議下一步 ───────────────────────────────────────
  console.log("──── 建議 ────");
  const fixable = drifts.filter((d) => d.reason === "no_account_at_all");
  const conflict = drifts.filter((d) => d.reason === "account_linked_to_other_user");

  if (fixable.length > 0) {
    console.log(
      `  🟢 ${fixable.length} 筆可安全 backfill（Account 不存在）：寫一支單獨的 backfill 腳本對每筆 createAccount 即可。`,
    );
  }
  if (conflict.length > 0) {
    console.log(
      `  🔴 ${conflict.length} 筆需人工處理（Account 已綁不同 user）：可能是身份分裂或 webhook 綁錯，須個別判定要 reassign Account.userId 還是 unbind Customer.lineUserId。`,
    );
  }
  console.log();
}

main()
  .catch((err) => {
    console.error("[diagnose-line-account-drift] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
