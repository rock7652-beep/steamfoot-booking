/**
 * diagnose-line-identity-drift.ts — READ-ONLY (PR-F1)
 *
 * Broader scan than the existing diagnose-line-account-drift.ts. Covers four
 * classes of LINE-identity drift; all output is masked.
 *
 * Checks:
 *   1. Customer.lineUserId set but Customer.userId is null
 *      (顧客已綁 LINE 但無登入帳號 — `webhook bind code on unactivated Customer`
 *       的預期狀態，但若數量持續上升表示 /profile 啟用流程斷掉)
 *   2. Account.userId ≠ Customer.userId for the same lineUserId
 *      (NextAuth Account 與 Customer 對應不一致 — 真實身份分裂)
 *   3. Same lineUserId across different stores
 *      (一個 LINE userId 出現在多店 — schema 允許但需要 awareness;
 *       per Cowork 方案 B 預期保留，這裡只 report)
 *   4. Customer.lineUserId set but matching Account row missing
 *      (與 diagnose-line-account-drift.ts 重疊但是 masked 版本)
 *
 * 用法：
 *   npx tsx scripts/diagnose-line-identity-drift.ts            # 全部 check, masked
 *   npx tsx scripts/diagnose-line-identity-drift.ts --count    # 只顯示 summary
 *   npx tsx scripts/diagnose-line-identity-drift.ts --store=zhubei
 *   npx tsx scripts/diagnose-line-identity-drift.ts --check=cross-store
 *
 * 安全：
 *   - 不寫 DB
 *   - 所有輸出 mask 過 (maskLineUserId / maskId / maskPhone)
 *   - 不 import 任何 server action; 只用 Prisma read methods
 *   - 不接受 --confirm-write / --execute flag (此腳本永遠 read-only)
 */
import { PrismaClient } from "@prisma/client";
import {
  maskLineUserId,
  maskId,
  maskPhone,
} from "../src/lib/line-bind-log";

const prisma = new PrismaClient();

const COUNT_ONLY = process.argv.includes("--count");
const storeFilterArg = process.argv.find((a) => a.startsWith("--store="));
const STORE_SLUG_FILTER = storeFilterArg?.split("=")[1] ?? null;
const checkArg = process.argv.find((a) => a.startsWith("--check="));
const CHECK_FILTER = checkArg?.split("=")[1] ?? null;

type CheckId =
  | "orphan-line"
  | "account-mismatch"
  | "cross-store"
  | "missing-account";

function shouldRun(id: CheckId): boolean {
  return CHECK_FILTER === null || CHECK_FILTER === id;
}

async function main() {
  console.log("===== LINE Identity Drift Diagnostic (READ-ONLY, masked) =====\n");

  const stores = await prisma.store.findMany({
    select: { id: true, slug: true, name: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s] as const));

  let storeIdFilter: string | null = null;
  if (STORE_SLUG_FILTER) {
    const s = stores.find((x) => x.slug === STORE_SLUG_FILTER);
    if (!s) {
      console.error(`Store with slug=${STORE_SLUG_FILTER} not found.`);
      process.exit(1);
    }
    storeIdFilter = s.id;
    console.log(`Filtering to store: ${s.slug} (${s.name})\n`);
  }

  if (shouldRun("orphan-line")) await runOrphanLineCheck(storeIdFilter, storeMap);
  if (shouldRun("account-mismatch")) await runAccountMismatchCheck(storeIdFilter, storeMap);
  if (shouldRun("cross-store")) await runCrossStoreCheck(storeIdFilter, storeMap);
  if (shouldRun("missing-account")) await runMissingAccountCheck(storeIdFilter, storeMap);
}

/**
 * Check 1: Customer.lineUserId set, Customer.userId is null.
 *
 * Expected non-zero baseline: webhook bind on an unactivated Customer leaves
 * userId null until they finish /profile activation. Watching the count trend
 * over time matters more than the absolute value.
 */
async function runOrphanLineCheck(
  storeIdFilter: string | null,
  storeMap: Map<string, { slug: string }>,
) {
  console.log("──── Check 1: orphan-line (Customer.lineUserId set, userId=null) ────");

  const rows = await prisma.customer.findMany({
    where: {
      lineUserId: { not: null },
      userId: null,
      mergedIntoCustomerId: null,
      ...(storeIdFilter ? { storeId: storeIdFilter } : {}),
    },
    select: {
      id: true,
      phone: true,
      storeId: true,
      lineUserId: true,
      lineLinkStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  console.log(`  total: ${rows.length}${rows.length === 200 ? " (capped at 200)" : ""}`);

  const byStore = rows.reduce(
    (acc, r) => {
      const slug = storeMap.get(r.storeId)?.slug ?? "?";
      acc[slug] = (acc[slug] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  for (const [slug, count] of Object.entries(byStore)) {
    console.log(`    - ${slug}: ${count}`);
  }

  if (!COUNT_ONLY && rows.length > 0) {
    console.log("\n  samples (masked, most recent 10):");
    for (const r of rows.slice(0, 10)) {
      console.log(
        `    customerId=${maskId(r.id)} store=${storeMap.get(r.storeId)?.slug ?? "?"} ` +
          `phone=${maskPhone(r.phone)} lineUserId=${maskLineUserId(r.lineUserId)} ` +
          `status=${r.lineLinkStatus}`,
      );
    }
  }
  console.log();
}

/**
 * Check 2: NextAuth Account[line] exists but Account.userId ≠ Customer.userId.
 *
 * Real identity split: webhook wrote Customer.lineUserId but LINE OAuth had
 * already created a different User. Both records live in DB pointing to
 * different login identities for the same human.
 *
 * PR-F1.1 triage enrichment:
 *   For each mismatch sample, additionally enrich with read-only triage
 *   signals so an operator can classify the split into one of three repair
 *   strategies WITHOUT touching prod:
 *     A) Account.user is an empty-shell User (no password, no other Customer,
 *        no bookings/transactions) — safe candidate for repointing
 *        Account.userId at Customer.userId
 *     B) Account.user has real footprint (bookings / transactions / other
 *        Accounts) — needs merge strategy, not a simple repoint
 *     C) Customer.user looks weaker than Account.user (e.g. Customer.user has
 *        no password but Account.user does) — repair direction would flip
 *
 * All enrichment is read-only via findUnique + count(). No email / phone /
 * raw cuid / raw LINE userId ever printed.
 *
 * Note on Account.createdAt/updatedAt: NextAuth's Account model in this
 * schema (see prisma/schema.prisma:374-391) does NOT declare createdAt /
 * updatedAt columns, so these are skipped. Reported in PR description, not
 * a schema change.
 */
async function runAccountMismatchCheck(
  storeIdFilter: string | null,
  storeMap: Map<string, { slug: string }>,
) {
  console.log("──── Check 2: account-mismatch (Account.userId ≠ Customer.userId) ────");

  const candidates = await prisma.customer.findMany({
    where: {
      lineUserId: { not: null },
      userId: { not: null },
      mergedIntoCustomerId: null,
      ...(storeIdFilter ? { storeId: storeIdFilter } : {}),
    },
    select: {
      id: true,
      storeId: true,
      userId: true,
      lineUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  let mismatchCount = 0;
  type Sample = {
    customerId: string;
    storeId: string;
    customerUserId: string;
    accountUserId: string;
    lineUserId: string;
    customerCreatedAt: Date;
    customerUpdatedAt: Date;
  };
  const samples: Sample[] = [];

  for (const c of candidates) {
    if (!c.lineUserId || !c.userId) continue;
    const acct = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "line",
          providerAccountId: c.lineUserId,
        },
      },
      select: { userId: true },
    });
    if (acct && acct.userId !== c.userId) {
      mismatchCount++;
      if (samples.length < 10) {
        samples.push({
          customerId: c.id,
          storeId: c.storeId,
          customerUserId: c.userId,
          accountUserId: acct.userId,
          lineUserId: c.lineUserId,
          customerCreatedAt: c.createdAt,
          customerUpdatedAt: c.updatedAt,
        });
      }
    }
  }

  console.log(`  total: ${mismatchCount}`);

  if (!COUNT_ONLY && samples.length > 0) {
    console.log("\n  samples (masked, first 10):");
    for (const s of samples) {
      const triage = await loadAccountMismatchTriage({
        customerUserId: s.customerUserId,
        accountUserId: s.accountUserId,
        thisLineUserId: s.lineUserId,
      });
      printAccountMismatchSample(s, triage, storeMap);
    }
    console.log(
      "\n  legend: hasPwd=passwordHash present; otherAccts=Account rows excluding the LINE one in question;",
    );
    console.log(
      "          customers=User.customer 1:1 presence (0/1); bookings/tx=count via that User's Customer (0 if no Customer)",
    );
    console.log(
      "  note: Account.createdAt / Account.updatedAt are NOT in schema — skipped (no schema change in this PR)",
    );
  }
  console.log();
}

/**
 * Read-only triage signals for an account-mismatch sample.
 *
 * Behaviour:
 *   - All calls are findUnique + count() — no $transaction, no write.
 *   - "Other" account count excludes THIS LINE Account so the operator can
 *     see whether Account.user has other identities (Google / additional
 *     LINE registrations) — a strong signal for non-empty-shell.
 *   - Bookings / Transactions live on Customer (not User). If a User has no
 *     Customer, counts are 0 by definition.
 */
async function loadAccountMismatchTriage(opts: {
  customerUserId: string;
  accountUserId: string;
  thisLineUserId: string;
}): Promise<AccountMismatchTriage> {
  const [customerUser, accountUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: opts.customerUserId },
      select: {
        createdAt: true,
        passwordHash: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: opts.accountUserId },
      select: {
        createdAt: true,
        passwordHash: true,
        customer: { select: { id: true } },
      },
    }),
  ]);

  const [accountUserOtherAccounts, accountUserBookings, accountUserTransactions] =
    await Promise.all([
      // OTHER accounts (exclude the LINE Account row in question)
      prisma.account.count({
        where: {
          userId: opts.accountUserId,
          NOT: {
            AND: [{ provider: "line" }, { providerAccountId: opts.thisLineUserId }],
          },
        },
      }),
      // bookings / transactions live on Customer; if accountUser has no
      // Customer, count is 0 (handled by the where clause matching nothing)
      prisma.booking.count({
        where: { customer: { userId: opts.accountUserId } },
      }),
      prisma.transaction.count({
        where: { customer: { userId: opts.accountUserId } },
      }),
    ]);

  return {
    customerUser: {
      exists: !!customerUser,
      createdAt: customerUser?.createdAt ?? null,
      hasPwd: !!customerUser?.passwordHash,
    },
    accountUser: {
      exists: !!accountUser,
      createdAt: accountUser?.createdAt ?? null,
      hasPwd: !!accountUser?.passwordHash,
      customerCount: accountUser?.customer ? 1 : 0,
      otherAccountCount: accountUserOtherAccounts,
      bookingCount: accountUserBookings,
      transactionCount: accountUserTransactions,
    },
  };
}

type AccountMismatchTriage = {
  customerUser: {
    exists: boolean;
    createdAt: Date | null;
    hasPwd: boolean;
  };
  accountUser: {
    exists: boolean;
    createdAt: Date | null;
    hasPwd: boolean;
    customerCount: 0 | 1;
    otherAccountCount: number;
    bookingCount: number;
    transactionCount: number;
  };
};

function fmtDate(d: Date | null): string {
  if (!d) return "(missing)";
  return d.toISOString().slice(0, 19) + "Z";
}

function printAccountMismatchSample(
  s: {
    customerId: string;
    storeId: string;
    customerUserId: string;
    accountUserId: string;
    lineUserId: string;
    customerCreatedAt: Date;
    customerUpdatedAt: Date;
  },
  t: AccountMismatchTriage,
  storeMap: Map<string, { slug: string }>,
): void {
  const storeSlug = storeMap.get(s.storeId)?.slug ?? "?";
  // Header line: identity (masked) + LINE id (masked)
  console.log(
    `\n    customerId=${maskId(s.customerId)} store=${storeSlug} lineUserId=${maskLineUserId(s.lineUserId)}`,
  );
  // Customer-side row
  console.log(
    `      customer.userId=${maskId(s.customerUserId)}` +
      ` hasPwd=${t.customerUser.hasPwd}` +
      ` user.createdAt=${fmtDate(t.customerUser.createdAt)}`,
  );
  console.log(
    `      customer.createdAt=${fmtDate(s.customerCreatedAt)}` +
      ` customer.updatedAt=${fmtDate(s.customerUpdatedAt)}`,
  );
  // Account-side row — the triage signal we actually care about
  console.log(
    `      account.userId=${maskId(s.accountUserId)}` +
      ` hasPwd=${t.accountUser.hasPwd}` +
      ` user.createdAt=${fmtDate(t.accountUser.createdAt)}`,
  );
  console.log(
    `      account.user.otherAccts=${t.accountUser.otherAccountCount}` +
      ` customers=${t.accountUser.customerCount}` +
      ` bookings=${t.accountUser.bookingCount}` +
      ` tx=${t.accountUser.transactionCount}`,
  );
  // Classification hint — pure local heuristic, no DB writes
  const looksEmptyShell =
    t.accountUser.exists &&
    !t.accountUser.hasPwd &&
    t.accountUser.customerCount === 0 &&
    t.accountUser.otherAccountCount === 0 &&
    t.accountUser.bookingCount === 0 &&
    t.accountUser.transactionCount === 0;
  console.log(
    `      classification=${looksEmptyShell ? "likely_empty_shell_A" : "needs_manual_review"}`,
  );
}

/**
 * Check 3: Same lineUserId across different stores.
 *
 * Cowork 方案 B 接受「一人每店一個 Customer」，所以同 lineUserId 在多店是預期狀態。
 * 本檢查只 report distribution — 若同一 LINE 跨 ≥ 3 店或數量爆增，可能是 webhook
 * destination 設定錯誤的訊號。
 */
async function runCrossStoreCheck(
  storeIdFilter: string | null,
  storeMap: Map<string, { slug: string }>,
) {
  console.log("──── Check 3: cross-store (same lineUserId in ≥ 2 stores) ────");

  // groupBy lineUserId where count > 1
  // Note: storeIdFilter is intentionally NOT applied to the groupBy — we need
  // to see the full distribution to detect cross-store presence.
  if (storeIdFilter) {
    console.log("  (--store ignored for cross-store check; reporting global view)");
  }

  const grouped = await prisma.customer.groupBy({
    by: ["lineUserId"],
    where: {
      lineUserId: { not: null },
      mergedIntoCustomerId: null,
    },
    _count: { _all: true },
    having: {
      lineUserId: { _count: { gt: 1 } },
    },
  });

  console.log(`  lineUserIds appearing in > 1 row: ${grouped.length}`);

  if (!COUNT_ONLY && grouped.length > 0) {
    console.log("\n  per-lineUserId store distribution (masked, first 20):");
    for (const g of grouped.slice(0, 20)) {
      if (!g.lineUserId) continue;
      const rows = await prisma.customer.findMany({
        where: { lineUserId: g.lineUserId, mergedIntoCustomerId: null },
        select: { storeId: true },
      });
      const slugs = rows
        .map((r) => storeMap.get(r.storeId)?.slug ?? "?")
        .sort();
      console.log(
        `    lineUserId=${maskLineUserId(g.lineUserId)} count=${g._count._all} stores=[${slugs.join(", ")}]`,
      );
    }
    if (grouped.length > 20) {
      console.log(`    ... ${grouped.length - 20} more not shown`);
    }
  }
  console.log();
}

/**
 * Check 4: Masked re-run of the existing diagnose-line-account-drift check.
 *
 * Same query but no raw IDs in output. Use the original
 * diagnose-line-account-drift.ts when you need the raw IDs as input for a
 * backfill script.
 */
async function runMissingAccountCheck(
  storeIdFilter: string | null,
  storeMap: Map<string, { slug: string }>,
) {
  console.log("──── Check 4: missing-account (Account[line] missing for Customer.lineUserId) ────");

  const candidates = await prisma.customer.findMany({
    where: {
      lineUserId: { not: null },
      userId: { not: null },
      mergedIntoCustomerId: null,
      ...(storeIdFilter ? { storeId: storeIdFilter } : {}),
    },
    select: { id: true, storeId: true, userId: true, lineUserId: true },
  });

  let missing = 0;
  const samples: Array<{ customerId: string; storeId: string; lineUserId: string }> = [];
  for (const c of candidates) {
    if (!c.lineUserId) continue;
    const acct = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "line",
          providerAccountId: c.lineUserId,
        },
      },
      select: { id: true },
    });
    if (!acct) {
      missing++;
      if (samples.length < 10) {
        samples.push({ customerId: c.id, storeId: c.storeId, lineUserId: c.lineUserId });
      }
    }
  }

  console.log(`  total: ${missing}`);
  if (!COUNT_ONLY && samples.length > 0) {
    console.log("\n  samples (masked, first 10):");
    for (const s of samples) {
      console.log(
        `    customerId=${maskId(s.customerId)} store=${storeMap.get(s.storeId)?.slug ?? "?"} ` +
          `lineUserId=${maskLineUserId(s.lineUserId)}`,
      );
    }
    console.log(
      "\n  (raw IDs for backfill: scripts/diagnose-line-account-drift.ts)",
    );
  }
  console.log();
}

main()
  .catch((err) => {
    console.error("[diagnose-line-identity-drift] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
