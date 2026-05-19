/**
 * audit-wallet-session-consistency.ts — wallet 顯示一致性盤點（READ-ONLY）
 *
 * 背景：顧客首頁 /book 的「剩餘可預約 X 堂」用
 *       `totalSessions - Σbooking(people)` 自行手算，完全不讀 canonical
 *       `CustomerPlanWallet.remainingSessions`（由 wallet-session.ts 的
 *       refreshWalletCounter 依 WalletSession ledger 維護）。
 *       凡是「不是透過 COMPLETED/NO_SHOW Booking row 消耗」的堂數——
 *       特別是 BACKFILLED（補登紙本已使用）與 VOIDED（店長註銷）——
 *       首頁完全看不到，於是高報剩餘堂數。
 *       my-plans 卡片的「已使用」同樣是 booking-derived，會低報。
 *
 * 本 script 盤點全體 wallet，找出四類顯示不一致：
 *   A) HOMEPAGE_MISMATCH  : 首頁公式 != canonical 可預約（顧客信任問題，主 bug）
 *   B) CARD_USED_MISMATCH : my-plans 卡片「已使用」(booking) != ledger 已使用
 *   C) COUNTER_STALE      : remainingSessions != count(AVAILABLE)+count(RESERVED)
 *   D) LEDGER_TOTAL_DRIFT : Σsession rows != totalSessions（ledger 完整性）
 *   E) UNTRACKED          : 完全沒有 WalletSession row（PR1 backfill 前的舊 wallet）
 *
 * **絕對只讀**。只有 prisma.customerPlanWallet.findMany / walletSession.groupBy；
 * 沒有任何 INSERT / UPDATE / DELETE / upsert / executeRaw / migration。
 *
 * 安全護欄：執行任何 query 前印出 masked DATABASE_URL（不含密碼）；
 *          未帶 `--yes-i-checked-db` 一律 abort，不建立連線、不發 query。
 *
 * Usage:
 *   # 先看 DB 目標（會 abort，這是刻意的）
 *   npx tsx scripts/audit-wallet-session-consistency.ts
 *
 *   # 確認是要稽核的環境後再實跑
 *   npx tsx scripts/audit-wallet-session-consistency.ts --yes-i-checked-db
 *
 *   # 限定店家 / 調整樣本數 / CSV
 *   npx tsx scripts/audit-wallet-session-consistency.ts --yes-i-checked-db --store <storeId>
 *   npx tsx scripts/audit-wallet-session-consistency.ts --yes-i-checked-db --samples 40
 *   npx tsx scripts/audit-wallet-session-consistency.ts --yes-i-checked-db --csv > drift.csv
 *
 * ============================================================
 * 等價 RAW SQL（可貼到 Supabase SQL editor 直接跑，純 SELECT）
 * ============================================================
 *
 * WITH ses AS (
 *   SELECT "walletId",
 *          COUNT(*)                                            AS s_total,
 *          COUNT(*) FILTER (WHERE "status" = 'AVAILABLE')       AS s_available,
 *          COUNT(*) FILTER (WHERE "status" = 'RESERVED')        AS s_reserved,
 *          COUNT(*) FILTER (WHERE "status" = 'COMPLETED')       AS s_completed,
 *          COUNT(*) FILTER (WHERE "status" = 'BACKFILLED')      AS s_backfilled,
 *          COUNT(*) FILTER (WHERE "status" = 'VOIDED')          AS s_voided
 *   FROM "WalletSession" GROUP BY "walletId"
 * ),
 * bk AS (
 *   SELECT "customerPlanWalletId" AS wid,
 *          COUNT(*) FILTER (WHERE "isMakeup" = false AND "bookingStatus" IN ('PENDING','CONFIRMED'))                              AS b_pending,
 *          COALESCE(SUM("people") FILTER (WHERE "isMakeup" = false AND "bookingStatus" IN ('COMPLETED','NO_SHOW')), 0)            AS b_used_people,
 *          COALESCE(SUM("people") FILTER (WHERE "isMakeup" = false AND "bookingStatus" IN ('CONFIRMED','PENDING')), 0)            AS b_pre_people,
 *          COUNT(*) FILTER (WHERE "isMakeup" = false AND "bookingStatus" = 'COMPLETED')                                           AS b_completed,
 *          COUNT(*) FILTER (WHERE "isMakeup" = false AND "bookingStatus" = 'NO_SHOW' AND "noShowPolicy" = 'DEDUCTED')             AS b_noshow_ded
 *   FROM "Booking" GROUP BY "customerPlanWalletId"
 * )
 * SELECT w."id" AS wallet_id, w."customerId", c."name", p."name" AS plan,
 *        w."status", w."totalSessions", w."remainingSessions",
 *        (w."totalSessions" - COALESCE(bk.b_used_people,0) - COALESCE(bk.b_pre_people,0))            AS homepage_formula,
 *        GREATEST(0, w."remainingSessions" - COALESCE(bk.b_pending,0))                               AS canonical_available,
 *        COALESCE(bk.b_completed,0) + COALESCE(bk.b_noshow_ded,0)                                    AS card_used_from_bookings,
 *        COALESCE(ses.s_completed,0) + COALESCE(ses.s_backfilled,0)                                  AS ledger_used,
 *        COALESCE(ses.s_available,0) + COALESCE(ses.s_reserved,0)                                    AS ses_avail_reserved,
 *        COALESCE(ses.s_total,0)                                                                     AS ses_total
 * FROM "CustomerPlanWallet" w
 * JOIN "Customer" c ON c."id" = w."customerId"
 * JOIN "ServicePlan" p ON p."id" = w."planId"
 * LEFT JOIN ses ON ses."walletId" = w."id"
 * LEFT JOIN bk  ON bk.wid = w."id"
 * WHERE
 *   (w."totalSessions" - COALESCE(bk.b_used_people,0) - COALESCE(bk.b_pre_people,0))
 *     <> GREATEST(0, w."remainingSessions" - COALESCE(bk.b_pending,0))
 *   OR (COALESCE(bk.b_completed,0) + COALESCE(bk.b_noshow_ded,0))
 *     <> (COALESCE(ses.s_completed,0) + COALESCE(ses.s_backfilled,0))
 *   OR (ses.s_total IS NOT NULL AND w."remainingSessions" <> (COALESCE(ses.s_available,0) + COALESCE(ses.s_reserved,0)))
 *   OR (ses.s_total IS NOT NULL AND ses.s_total <> w."totalSessions")
 * ORDER BY w."customerId";
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Args = {
  storeId?: string;
  samples: number;
  csv: boolean;
  yesIcheckedDb: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { samples: 20, csv: false, yesIcheckedDb: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--store") args.storeId = argv[++i];
    else if (a === "--samples") args.samples = parseInt(argv[++i], 10);
    else if (a === "--csv") args.csv = true;
    else if (a === "--yes-i-checked-db") args.yesIcheckedDb = true;
  }
  return args;
}

function describeDatabaseUrl(): {
  host: string;
  port: string;
  database: string;
  user: string;
  looksLike: string;
} | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname || "(no host)";
    const port = u.port || "(default)";
    const database = u.pathname.replace(/^\//, "") || "(no database)";
    const user = u.username || "(no user)";
    let looksLike = "unknown";
    const hostLc = host.toLowerCase();
    if (hostLc.includes("pooler")) {
      looksLike = port === "6543" ? "Supabase pooler (transaction)" : "Supabase pooler";
    } else if (hostLc.includes("supabase.co") || hostLc.includes("supabase.com")) {
      looksLike = "Supabase direct";
    } else if (hostLc === "localhost" || hostLc === "127.0.0.1") {
      looksLike = "local";
    }
    return { host, port, database, user, looksLike };
  } catch {
    return null;
  }
}

function printDbTargetBanner(info: ReturnType<typeof describeDatabaseUrl>) {
  console.log("=".repeat(72));
  console.log("DB 目標確認（password 不顯示）");
  console.log("=".repeat(72));
  if (!info) {
    console.log("  DATABASE_URL: (missing or unparseable)");
    return;
  }
  console.log(`  host     : ${info.host}`);
  console.log(`  port     : ${info.port}`);
  console.log(`  database : ${info.database}`);
  console.log(`  user     : ${info.user}`);
  console.log(`  looks    : ${info.looksLike}`);
  console.log("");
}

function abortWithoutConfirm(): never {
  console.error("");
  console.error("─".repeat(72));
  console.error("⛔  ABORTED — 未帶 --yes-i-checked-db，不執行任何 query。");
  console.error("─".repeat(72));
  console.error("");
  console.error("請先確認上方 DB 目標是 staging / preview / production 哪一個。");
  console.error("這是純讀稽核，但跑錯環境拿到的數字無法對應你預期的環境。");
  console.error("");
  console.error("確認後再加 flag 重跑：");
  console.error("  npx tsx scripts/audit-wallet-session-consistency.ts --yes-i-checked-db");
  console.error("");
  process.exit(2);
}

type Flag =
  | "HOMEPAGE_MISMATCH"
  | "CARD_USED_MISMATCH"
  | "COUNTER_STALE"
  | "LEDGER_TOTAL_DRIFT"
  | "UNTRACKED";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  printDbTargetBanner(describeDatabaseUrl());
  if (!args.yesIcheckedDb) abortWithoutConfirm();

  console.log("=".repeat(72));
  console.log("Wallet 顯示一致性盤點（READ-ONLY）");
  console.log("=".repeat(72));
  if (args.storeId) console.log(`Store filter: ${args.storeId}`);
  console.log("");

  const wallets = await prisma.customerPlanWallet.findMany({
    where: args.storeId ? { storeId: args.storeId } : undefined,
    select: {
      id: true,
      customerId: true,
      status: true,
      totalSessions: true,
      remainingSessions: true,
      customer: { select: { name: true } },
      plan: { select: { name: true } },
      bookings: {
        where: { isMakeup: false },
        select: { bookingStatus: true, people: true, noShowPolicy: true },
      },
    },
  });

  // WalletSession 狀態統計（單一 groupBy，避免 N+1）
  const sesGroups = await prisma.walletSession.groupBy({
    by: ["walletId", "status"],
    _count: { _all: true },
  });
  const sesByWallet = new Map<
    string,
    { total: number; available: number; reserved: number; completed: number; backfilled: number; voided: number }
  >();
  for (const g of sesGroups) {
    const e =
      sesByWallet.get(g.walletId) ??
      { total: 0, available: 0, reserved: 0, completed: 0, backfilled: 0, voided: 0 };
    const n = g._count._all;
    e.total += n;
    if (g.status === "AVAILABLE") e.available += n;
    else if (g.status === "RESERVED") e.reserved += n;
    else if (g.status === "COMPLETED") e.completed += n;
    else if (g.status === "BACKFILLED") e.backfilled += n;
    else if (g.status === "VOIDED") e.voided += n;
    sesByWallet.set(g.walletId, e);
  }

  const rows: {
    flags: Flag[];
    customerId: string;
    name: string;
    walletId: string;
    plan: string;
    status: string;
    total: number;
    remaining: number;
    homepageFormula: number;
    canonicalAvailable: number;
    cardUsedFromBookings: number;
    ledgerUsed: number;
  }[] = [];

  for (const w of wallets) {
    const usedPeople = w.bookings
      .filter((b) => b.bookingStatus === "COMPLETED" || b.bookingStatus === "NO_SHOW")
      .reduce((s, b) => s + b.people, 0);
    const prePeople = w.bookings
      .filter((b) => b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING")
      .reduce((s, b) => s + b.people, 0);
    const pendingCount = w.bookings.filter(
      (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED"
    ).length;
    const cardUsedFromBookings =
      w.bookings.filter((b) => b.bookingStatus === "COMPLETED").length +
      w.bookings.filter((b) => b.bookingStatus === "NO_SHOW" && b.noShowPolicy === "DEDUCTED").length;

    const homepageFormula = w.totalSessions - usedPeople - prePeople;
    const canonicalAvailable = Math.max(0, w.remainingSessions - pendingCount);

    const ses = sesByWallet.get(w.id);
    const flags: Flag[] = [];

    if (!ses || ses.total === 0) {
      flags.push("UNTRACKED");
    } else {
      const ledgerUsed = ses.completed + ses.backfilled;
      if (homepageFormula !== canonicalAvailable) flags.push("HOMEPAGE_MISMATCH");
      if (cardUsedFromBookings !== ledgerUsed) flags.push("CARD_USED_MISMATCH");
      if (w.remainingSessions !== ses.available + ses.reserved) flags.push("COUNTER_STALE");
      if (ses.total !== w.totalSessions) flags.push("LEDGER_TOTAL_DRIFT");
    }

    if (flags.length === 0) continue;

    rows.push({
      flags,
      customerId: w.customerId,
      name: w.customer?.name ?? "(no name)",
      walletId: w.id,
      plan: w.plan?.name ?? "(no plan)",
      status: w.status,
      total: w.totalSessions,
      remaining: w.remainingSessions,
      homepageFormula,
      canonicalAvailable,
      cardUsedFromBookings,
      ledgerUsed: ses ? ses.completed + ses.backfilled : 0,
    });
  }

  const counts: Record<Flag, number> = {
    HOMEPAGE_MISMATCH: 0,
    CARD_USED_MISMATCH: 0,
    COUNTER_STALE: 0,
    LEDGER_TOTAL_DRIFT: 0,
    UNTRACKED: 0,
  };
  for (const r of rows) for (const f of r.flags) counts[f]++;

  console.log(`掃描 wallet 總數          : ${wallets.length}`);
  console.log(`有問題的 wallet 數        : ${rows.length}`);
  console.log("");
  console.log("分類計數（一個 wallet 可能多個 flag）:");
  console.log(`  HOMEPAGE_MISMATCH  (首頁高/低報，顧客信任) : ${counts.HOMEPAGE_MISMATCH}`);
  console.log(`  CARD_USED_MISMATCH (my-plans「已使用」錯)   : ${counts.CARD_USED_MISMATCH}`);
  console.log(`  COUNTER_STALE      (remainingSessions 髒)  : ${counts.COUNTER_STALE}`);
  console.log(`  LEDGER_TOTAL_DRIFT (session 數 != 總堂數)   : ${counts.LEDGER_TOTAL_DRIFT}`);
  console.log(`  UNTRACKED          (無 WalletSession 舊卡)  : ${counts.UNTRACKED}`);
  console.log("");

  if (args.csv) {
    console.log(
      "flags,customerId,name,walletId,plan,status,total,remaining,homepageFormula,canonicalAvailable,cardUsedFromBookings,ledgerUsed"
    );
    for (const r of rows) {
      console.log(
        [
          r.flags.join("|"),
          r.customerId,
          JSON.stringify(r.name),
          r.walletId,
          JSON.stringify(r.plan),
          r.status,
          r.total,
          r.remaining,
          r.homepageFormula,
          r.canonicalAvailable,
          r.cardUsedFromBookings,
          r.ledgerUsed,
        ].join(",")
      );
    }
  } else {
    const sample = rows
      .filter((r) => r.flags.includes("HOMEPAGE_MISMATCH") || r.flags.includes("CARD_USED_MISMATCH"))
      .slice(0, args.samples);
    console.log(`代表案例（最多 ${args.samples} 筆，優先顯示顧客可見的不一致）:`);
    for (const r of sample) {
      console.log(
        `  [${r.flags.join("|")}] ${r.name} / ${r.plan} (${r.status}) ` +
          `total=${r.total} remaining=${r.remaining} ` +
          `首頁=${r.homepageFormula} 正確可預約=${r.canonicalAvailable} ` +
          `卡片已使用=${r.cardUsedFromBookings} ledger已使用=${r.ledgerUsed} ` +
          `wallet=${r.walletId} customer=${r.customerId}`
      );
    }
    if (sample.length === 0) console.log("  (無顧客可見不一致)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
