/**
 * audit-single-with-active-wallet.ts — SINGLE 預約 vs 顧客可用 wallet 盤點（READ-ONLY）
 *
 * 用途：PR #138 後續驗收發現有 active wallet 的顧客仍被建立成 bookingType=SINGLE
 *       的預約（不扣堂、不綁 wallet）。本 script 盤點此問題的歷史規模，
 *       供後續決定是否要做「後台新增預約防呆 PR」。
 *
 * 判斷邏輯（保守 proxy）：
 *   一筆 SINGLE booking 算「應該用方案」當且僅當該顧客存在 wallet 滿足：
 *     a) wallet.createdAt <= booking.createdAt  （錢包在預約建立前就存在）
 *     b) wallet.status = ACTIVE
 *     c) wallet.remainingSessions > 0           （目前還有剩餘）
 *     d) wallet.expiryDate IS NULL OR expiryDate >= booking.bookingDate
 *                                               （預約日期在效期內）
 *
 *   保守邊界說明：
 *   - 用「目前 remainingSessions > 0」當 proxy，會少算「預約當下有剩、後來被
 *     別的方式扣光」的 wallet。對「規模盤點」目的而言這是 conservative under-count，
 *     可接受。
 *   - 沒有反推歷史狀態（要看 WalletSession audit 才行），避免複雜度爆炸。
 *
 * **絕對只讀**。沒有 INSERT / UPDATE / DELETE / upsert / executeRaw / migration。
 *
 * 安全護欄：
 *   執行任何 query 前會印出當前 DATABASE_URL 的 masked 連線資訊
 *   (host / port / database / user / looks-like，password 一律不顯示)。
 *   未帶 `--yes-i-checked-db` 一律 abort，不會建立 DB 連線、不會發出任何 query。
 *   目的：強迫 operator 看一眼目標是 staging / preview / production。
 *
 * Usage:
 *   # 第一次跑：不帶 confirm flag，會印出 DB 目標然後 abort（這就是用意）
 *   npx tsx scripts/audit-single-with-active-wallet.ts
 *
 *   # 確認 DB 目標後再加 flag 實際執行（預設 30 + 90 天兩個窗口）
 *   npx tsx scripts/audit-single-with-active-wallet.ts --yes-i-checked-db
 *
 *   # 自訂窗口
 *   npx tsx scripts/audit-single-with-active-wallet.ts --yes-i-checked-db --days 60
 *
 *   # 限定店家
 *   npx tsx scripts/audit-single-with-active-wallet.ts --yes-i-checked-db --store <storeId>
 *
 *   # 列更多代表案例
 *   npx tsx scripts/audit-single-with-active-wallet.ts --yes-i-checked-db --samples 30
 *
 *   # CSV 輸出（代表案例）
 *   npx tsx scripts/audit-single-with-active-wallet.ts --yes-i-checked-db --csv > sample.csv
 *
 * ============================================================
 * 等價 RAW SQL（可貼到 Supabase SQL editor / psql 直接跑）
 * 把 :days / :storeId 替換成數字 / id；如不過濾店家拿掉那行 AND b."storeId" = ...
 * ============================================================
 *
 * -- (0) Baseline：近 N 天 SINGLE 總數（不過濾顧客是否有 wallet）
 * SELECT COUNT(*) AS single_total_30d
 * FROM "Booking" b
 * WHERE b."bookingType" = 'SINGLE'
 *   AND b."bookingDate" >= (CURRENT_DATE - INTERVAL '30 days');
 *
 * -- (1) 命中數：SINGLE + 顧客在預約建立時已有可用 wallet
 * SELECT COUNT(*) AS single_with_active_wallet_30d
 * FROM "Booking" b
 * WHERE b."bookingType" = 'SINGLE'
 *   AND b."bookingDate" >= (CURRENT_DATE - INTERVAL '30 days')
 *   AND EXISTS (
 *     SELECT 1 FROM "CustomerPlanWallet" w
 *     WHERE w."customerId" = b."customerId"
 *       AND w."createdAt" <= b."createdAt"
 *       AND w."status" = 'ACTIVE'
 *       AND w."remainingSessions" > 0
 *       AND (w."expiryDate" IS NULL OR w."expiryDate" >= b."bookingDate")
 *   );
 *
 * -- (2) 入口分布（bookedByType: CUSTOMER=顧客自助 / STAFF=店長後台 / ADMIN）
 * SELECT b."bookedByType", COUNT(*) AS n
 * FROM "Booking" b
 * WHERE b."bookingType" = 'SINGLE'
 *   AND b."bookingDate" >= (CURRENT_DATE - INTERVAL '30 days')
 *   AND EXISTS (
 *     SELECT 1 FROM "CustomerPlanWallet" w
 *     WHERE w."customerId" = b."customerId"
 *       AND w."createdAt" <= b."createdAt"
 *       AND w."status" = 'ACTIVE'
 *       AND w."remainingSessions" > 0
 *       AND (w."expiryDate" IS NULL OR w."expiryDate" >= b."bookingDate")
 *   )
 * GROUP BY 1
 * ORDER BY n DESC;
 *
 * -- (3) 代表案例 10 筆（含當下可用 wallet 詳情）
 * SELECT
 *   b."id"             AS booking_id,
 *   b."bookingDate"    AS booking_date,
 *   b."slotTime"       AS slot_time,
 *   c."name"           AS customer_name,
 *   b."bookingStatus"  AS booking_status,
 *   b."bookedByType"   AS booked_by_type,
 *   b."customerPlanWalletId" AS wallet_id_on_booking,
 *   (
 *     SELECT json_agg(json_build_object(
 *       'walletId', w."id",
 *       'planName', p."name",
 *       'remainingSessions', w."remainingSessions",
 *       'totalSessions', w."totalSessions",
 *       'expiryDate', w."expiryDate",
 *       'createdAt', w."createdAt"
 *     ))
 *     FROM "CustomerPlanWallet" w
 *     JOIN "ServicePlan" p ON p."id" = w."planId"
 *     WHERE w."customerId" = b."customerId"
 *       AND w."createdAt" <= b."createdAt"
 *       AND w."status" = 'ACTIVE'
 *       AND w."remainingSessions" > 0
 *       AND (w."expiryDate" IS NULL OR w."expiryDate" >= b."bookingDate")
 *   ) AS available_wallets
 * FROM "Booking" b
 * JOIN "Customer" c ON c."id" = b."customerId"
 * WHERE b."bookingType" = 'SINGLE'
 *   AND b."bookingDate" >= (CURRENT_DATE - INTERVAL '30 days')
 *   AND EXISTS (
 *     SELECT 1 FROM "CustomerPlanWallet" w
 *     WHERE w."customerId" = b."customerId"
 *       AND w."createdAt" <= b."createdAt"
 *       AND w."status" = 'ACTIVE'
 *       AND w."remainingSessions" > 0
 *       AND (w."expiryDate" IS NULL OR w."expiryDate" >= b."bookingDate")
 *   )
 * ORDER BY b."bookingDate" DESC, b."createdAt" DESC
 * LIMIT 10;
 *
 * -- (4) 手動註銷堂數訊號（這些命中顧客的 wallet 是否有 VOIDED session）
 * SELECT c."id" AS customer_id, c."name",
 *        COUNT(*) FILTER (WHERE ws."status" = 'VOIDED') AS voided_sessions
 * FROM "Customer" c
 * JOIN "CustomerPlanWallet" w ON w."customerId" = c."id"
 * JOIN "WalletSession" ws ON ws."walletId" = w."id"
 * WHERE c."id" IN (
 *   SELECT DISTINCT b."customerId"
 *   FROM "Booking" b
 *   WHERE b."bookingType" = 'SINGLE'
 *     AND b."bookingDate" >= (CURRENT_DATE - INTERVAL '30 days')
 *     AND EXISTS (
 *       SELECT 1 FROM "CustomerPlanWallet" w2
 *       WHERE w2."customerId" = b."customerId"
 *         AND w2."createdAt" <= b."createdAt"
 *         AND w2."status" = 'ACTIVE'
 *         AND w2."remainingSessions" > 0
 *     )
 * )
 * GROUP BY 1, 2
 * HAVING COUNT(*) FILTER (WHERE ws."status" = 'VOIDED') > 0
 * ORDER BY voided_sessions DESC;
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type Args = {
  days: number[];
  storeId?: string;
  samples: number;
  csv: boolean;
  yesIcheckedDb: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    days: [30, 90],
    samples: 10,
    csv: false,
    yesIcheckedDb: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") args.days = [parseInt(argv[++i], 10)];
    else if (a === "--store") args.storeId = argv[++i];
    else if (a === "--samples") args.samples = parseInt(argv[++i], 10);
    else if (a === "--csv") args.csv = true;
    else if (a === "--yes-i-checked-db") args.yesIcheckedDb = true;
  }
  return args;
}

/**
 * 解析 DATABASE_URL 並回傳 masked 連線資訊（password 不會被回傳 / 不會被印出）。
 *
 * 用途：在任何 query 執行前讓 operator 親眼確認目前指向哪個 DB
 *      (staging / preview / production)，避免誤打 prod。
 */
function describeDatabaseUrl(): {
  host: string;
  port: string;
  database: string;
  user: string;
  looksLike: string; // 「Supabase pooler (transaction)」/「Supabase direct」/「unknown」
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
  console.error("即使是 read-only audit，跑錯環境會：");
  console.error("  - 在 prod 留下不必要的查詢負載");
  console.error("  - 拿到的數字無法對應你預期的環境");
  console.error("  - 認證 / 連線問題會在 prod 首次浮現");
  console.error("");
  console.error("確認後再加 flag 重跑：");
  console.error("  npx tsx scripts/audit-single-with-active-wallet.ts --yes-i-checked-db");
  console.error("");
  process.exit(2);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function countSingleTotal(since: Date, storeId?: string) {
  return prisma.booking.count({
    where: {
      bookingType: "SINGLE",
      bookingDate: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
  });
}

/**
 * 「顧客在預約建立時點已有可用 wallet」的 SINGLE booking。
 *
 * Prisma 沒辦法直接表達「wallet.createdAt <= booking.createdAt」這種 row-by-row
 * 相關子查詢，所以走 raw SQL。仍是純 SELECT、沒有 write。
 */
async function findSingleWithActiveWallet(
  since: Date,
  storeId?: string,
  limit?: number,
): Promise<
  Array<{
    bookingId: string;
    bookingDate: Date;
    slotTime: string;
    bookingStatus: string;
    bookedByType: string;
    customerId: string;
    customerName: string;
    customerPlanWalletIdOnBooking: string | null;
    createdAt: Date;
  }>
> {
  const storeFilter = storeId
    ? Prisma.sql`AND b."storeId" = ${storeId}`
    : Prisma.empty;
  const limitClause = limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  return prisma.$queryRaw<
    Array<{
      bookingId: string;
      bookingDate: Date;
      slotTime: string;
      bookingStatus: string;
      bookedByType: string;
      customerId: string;
      customerName: string;
      customerPlanWalletIdOnBooking: string | null;
      createdAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      b."id"                      AS "bookingId",
      b."bookingDate"             AS "bookingDate",
      b."slotTime"                AS "slotTime",
      b."bookingStatus"::text     AS "bookingStatus",
      b."bookedByType"::text      AS "bookedByType",
      b."customerId"              AS "customerId",
      c."name"                    AS "customerName",
      b."customerPlanWalletId"    AS "customerPlanWalletIdOnBooking",
      b."createdAt"               AS "createdAt"
    FROM "Booking" b
    JOIN "Customer" c ON c."id" = b."customerId"
    WHERE b."bookingType" = 'SINGLE'
      AND b."bookingDate" >= ${since}
      ${storeFilter}
      AND EXISTS (
        SELECT 1 FROM "CustomerPlanWallet" w
        WHERE w."customerId" = b."customerId"
          AND w."createdAt" <= b."createdAt"
          AND w."status" = 'ACTIVE'
          AND w."remainingSessions" > 0
          AND (w."expiryDate" IS NULL OR w."expiryDate" >= b."bookingDate")
      )
    ORDER BY b."bookingDate" DESC, b."createdAt" DESC
    ${limitClause}
  `);
}

async function entryPointBreakdown(since: Date, storeId?: string) {
  const storeFilter = storeId
    ? Prisma.sql`AND b."storeId" = ${storeId}`
    : Prisma.empty;
  return prisma.$queryRaw<Array<{ bookedByType: string; n: bigint }>>(
    Prisma.sql`
      SELECT b."bookedByType"::text AS "bookedByType", COUNT(*)::bigint AS n
      FROM "Booking" b
      WHERE b."bookingType" = 'SINGLE'
        AND b."bookingDate" >= ${since}
        ${storeFilter}
        AND EXISTS (
          SELECT 1 FROM "CustomerPlanWallet" w
          WHERE w."customerId" = b."customerId"
            AND w."createdAt" <= b."createdAt"
            AND w."status" = 'ACTIVE'
            AND w."remainingSessions" > 0
            AND (w."expiryDate" IS NULL OR w."expiryDate" >= b."bookingDate")
        )
      GROUP BY 1
      ORDER BY n DESC
    `,
  );
}

async function walletDetailsForCustomerAt(
  customerId: string,
  beforeOrAt: Date,
  bookingDate: Date,
) {
  return prisma.customerPlanWallet.findMany({
    where: {
      customerId,
      createdAt: { lte: beforeOrAt },
      status: "ACTIVE",
      remainingSessions: { gt: 0 },
      OR: [{ expiryDate: null }, { expiryDate: { gte: bookingDate } }],
    },
    select: {
      id: true,
      remainingSessions: true,
      totalSessions: true,
      expiryDate: true,
      createdAt: true,
      plan: { select: { name: true, category: true } },
    },
  });
}

async function voidedSessionSignal(customerIds: string[]) {
  if (customerIds.length === 0) return [];
  return prisma.$queryRaw<
    Array<{ customerId: string; name: string; voidedSessions: bigint }>
  >(Prisma.sql`
    SELECT c."id" AS "customerId", c."name", COUNT(*)::bigint AS "voidedSessions"
    FROM "Customer" c
    JOIN "CustomerPlanWallet" w ON w."customerId" = c."id"
    JOIN "WalletSession" ws ON ws."walletId" = w."id"
    WHERE c."id" IN (${Prisma.join(customerIds)})
      AND ws."status" = 'VOIDED'
    GROUP BY 1, 2
    ORDER BY "voidedSessions" DESC
  `);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 安全護欄：在任何 query 之前先讓 operator 確認 DB 目標。
  // 沒帶 --yes-i-checked-db 就直接 abort，不會建立任何 DB 連線、不會發出任何 query。
  const dbInfo = describeDatabaseUrl();
  printDbTargetBanner(dbInfo);
  if (!args.yesIcheckedDb) {
    abortWithoutConfirm();
  }

  if (!args.csv) {
    console.log("=".repeat(72));
    console.log("SINGLE 預約 vs 顧客可用 wallet 盤點（READ-ONLY）");
    console.log("=".repeat(72));
    if (args.storeId) console.log(`Store filter: ${args.storeId}`);
    console.log("");
  }

  for (const days of args.days) {
    const since = daysAgo(days);

    const [totalSingle, hits, entryBreakdown] = await Promise.all([
      countSingleTotal(since, args.storeId),
      findSingleWithActiveWallet(since, args.storeId),
      entryPointBreakdown(since, args.storeId),
    ]);

    if (args.csv) continue;

    const hitCount = hits.length;
    const ratio =
      totalSingle === 0 ? 0 : Math.round((hitCount / totalSingle) * 1000) / 10;

    console.log(`── 近 ${days} 天（since ${formatDate(since)}）`);
    console.log(`  SINGLE 預約總數         : ${totalSingle}`);
    console.log(`  其中顧客有可用 wallet   : ${hitCount}  (${ratio}%)`);
    console.log(`  入口分布（命中筆數）    :`);
    if (entryBreakdown.length === 0) {
      console.log(`    (no hits)`);
    } else {
      for (const row of entryBreakdown) {
        console.log(`    ${row.bookedByType.padEnd(10)} ${row.n}`);
      }
    }
    console.log("");
  }

  const sampleSince = daysAgo(args.days[0] ?? 30);
  const samples = await findSingleWithActiveWallet(
    sampleSince,
    args.storeId,
    args.samples,
  );

  if (args.csv) {
    const header = [
      "bookingId",
      "bookingDate",
      "slotTime",
      "customerName",
      "bookingStatus",
      "bookedByType",
      "walletIdOnBooking",
      "availableWallets",
    ];
    console.log(header.join(","));
  } else {
    console.log("=".repeat(72));
    console.log(`代表案例（最多 ${args.samples} 筆，近 ${args.days[0]} 天內）`);
    console.log("=".repeat(72));
  }

  const enriched = await Promise.all(
    samples.map(async (s) => {
      const wallets = await walletDetailsForCustomerAt(
        s.customerId,
        s.createdAt,
        s.bookingDate,
      );
      return { ...s, wallets };
    }),
  );

  for (const row of enriched) {
    if (args.csv) {
      const walletStr = row.wallets
        .map(
          (w) =>
            `${w.plan.name}(剩${w.remainingSessions}/${w.totalSessions}, exp=${w.expiryDate ? formatDate(w.expiryDate) : "∞"})`,
        )
        .join(" | ");
      console.log(
        [
          row.bookingId,
          formatDate(row.bookingDate),
          row.slotTime,
          JSON.stringify(row.customerName),
          row.bookingStatus,
          row.bookedByType,
          row.customerPlanWalletIdOnBooking ?? "",
          JSON.stringify(walletStr),
        ].join(","),
      );
    } else {
      console.log("");
      console.log(`booking ${row.bookingId}`);
      console.log(
        `  ${formatDate(row.bookingDate)} ${row.slotTime}  ${row.customerName}`,
      );
      console.log(
        `  status=${row.bookingStatus}  bookedBy=${row.bookedByType}  walletOnBooking=${row.customerPlanWalletIdOnBooking ?? "(none)"}`,
      );
      console.log(`  顧客當下可用 wallets:`);
      for (const w of row.wallets) {
        console.log(
          `    - ${w.plan.name} [${w.plan.category}]  剩 ${w.remainingSessions}/${w.totalSessions}  exp=${w.expiryDate ? formatDate(w.expiryDate) : "∞"}  (created ${formatDate(w.createdAt)})`,
        );
      }
    }
  }

  if (!args.csv) {
    const customerIds = Array.from(new Set(enriched.map((r) => r.customerId)));
    const voided = await voidedSessionSignal(customerIds);
    console.log("");
    console.log("=".repeat(72));
    console.log("手動註銷堂數訊號（命中顧客中有 VOIDED WalletSession 的）");
    console.log("=".repeat(72));
    if (voided.length === 0) {
      console.log("  (無 VOIDED session — 沒有店家手動扣堂的跡象)");
    } else {
      for (const v of voided) {
        console.log(`  ${v.name}  voided=${v.voidedSessions}`);
      }
    }
    console.log("");
    console.log(
      "提醒：這份 audit 是 conservative under-count — 「預約當下有剩、後來扣光」的 wallet 不會被算進來。",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
