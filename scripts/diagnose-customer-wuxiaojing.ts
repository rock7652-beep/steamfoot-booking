/**
 * diagnose-customer-wuxiaojing.ts — READ-ONLY
 *
 * 查 0976118631 / 吳曉菁 兩筆 Customer 是不是身份分裂，
 * 把每筆相關的 Booking / Wallet / Transaction / Point / Referral / Message / Account
 * 數量都列出來，供人工判斷哪一筆是 canonical、哪一筆可清掉 LINE 綁定。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_PHONE = "0976118631";
const TARGET_NAME = "吳曉菁";

async function main() {
  console.log("===== 吳曉菁 / 0976118631 身份分裂診斷 (READ-ONLY) =====\n");

  // 1. 抓所有名字含「吳曉菁」或電話含 0976118631 的 Customer（跨店）
  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { phone: TARGET_PHONE },
        { name: { contains: TARGET_NAME } },
      ],
    },
    include: {
      store: { select: { id: true, slug: true, name: true } },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          status: true,
          passwordHash: true,
          createdAt: true,
          accounts: {
            select: { id: true, provider: true, providerAccountId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`找到 ${customers.length} 筆 Customer：\n`);
  for (const c of customers) {
    console.log(`────────────────────────────────────────`);
    console.log(`Customer.id        = ${c.id}`);
    console.log(`  store            = ${c.store.slug} (${c.store.name})`);
    console.log(`  name             = ${c.name}`);
    console.log(`  phone            = ${c.phone}`);
    console.log(`  email            = ${c.email ?? "(none)"}`);
    console.log(`  authSource       = ${c.authSource}`);
    console.log(`  customerStage    = ${c.customerStage}`);
    console.log(`  talentStage      = ${c.talentStage}`);
    console.log(`  userId           = ${c.userId ?? "(none)"}`);
    console.log(`  googleId         = ${c.googleId ?? "(none)"}`);
    console.log(`  lineUserId       = ${c.lineUserId ?? "(none)"}`);
    console.log(`  lineLinkStatus   = ${c.lineLinkStatus}`);
    console.log(`  lineLinkedAt     = ${c.lineLinkedAt?.toISOString() ?? "(none)"}`);
    console.log(`  lineBindingCode  = ${c.lineBindingCode ?? "(none)"}`);
    console.log(`  lineName         = ${c.lineName ?? "(none)"}`);
    console.log(`  mergedIntoCustomerId = ${c.mergedIntoCustomerId ?? "(none)"}`);
    console.log(`  createdAt        = ${c.createdAt.toISOString()}`);
    console.log(`  updatedAt        = ${c.updatedAt.toISOString()}`);

    if (c.user) {
      console.log(`  ── User ──`);
      console.log(`    User.id        = ${c.user.id}`);
      console.log(`    email          = ${c.user.email ?? "(none)"}`);
      console.log(`    phone          = ${c.user.phone ?? "(none)"}`);
      console.log(`    name           = ${c.user.name}`);
      console.log(`    role           = ${c.user.role}`);
      console.log(`    status         = ${c.user.status}`);
      console.log(`    passwordHash   = ${c.user.passwordHash ? "set" : "(none)"}`);
      console.log(`    createdAt      = ${c.user.createdAt.toISOString()}`);
      if (c.user.accounts.length === 0) {
        console.log(`    Accounts       = (none)`);
      } else {
        for (const a of c.user.accounts) {
          console.log(
            `    Account        = id=${a.id} provider=${a.provider} providerAccountId=${a.providerAccountId}`,
          );
        }
      }
    } else {
      console.log(`  ── User: (none, customer 無 userId) ──`);
    }

    // 業務資料統計
    const [bookingCount, walletCount, sessionCount, txCount, pointCount, referralMadeCount, sponsoredCount, referralEvtAsCustCount, referralEvtAsRefCount, msgCount, checkinCount, makeupCount] =
      await Promise.all([
        prisma.booking.count({ where: { customerId: c.id } }),
        prisma.customerPlanWallet.count({ where: { customerId: c.id } }),
        prisma.walletSession.count({ where: { wallet: { customerId: c.id } } }),
        prisma.transaction.count({ where: { customerId: c.id } }),
        prisma.pointRecord.count({ where: { customerId: c.id } }),
        prisma.referral.count({ where: { referrerId: c.id } }),
        prisma.customer.count({ where: { sponsorId: c.id } }),
        prisma.referralEvent.count({ where: { customerId: c.id } }),
        prisma.referralEvent.count({ where: { referrerId: c.id } }),
        prisma.messageLog.count({ where: { customerId: c.id } }),
        prisma.checkinPost.count({ where: { customerId: c.id } }),
        prisma.makeupCredit.count({ where: { customerId: c.id } }),
      ]);

    console.log(`  ── 業務資料 ──`);
    console.log(`    Booking            : ${bookingCount}`);
    console.log(`    CustomerPlanWallet : ${walletCount}`);
    console.log(`    WalletSession      : ${sessionCount}`);
    console.log(`    Transaction        : ${txCount}`);
    console.log(`    PointRecord        : ${pointCount}`);
    console.log(`    Referral (made)    : ${referralMadeCount}`);
    console.log(`    Sponsored 顧客     : ${sponsoredCount}`);
    console.log(`    ReferralEvent (as customer) : ${referralEvtAsCustCount}`);
    console.log(`    ReferralEvent (as referrer) : ${referralEvtAsRefCount}`);
    console.log(`    MessageLog         : ${msgCount}`);
    console.log(`    CheckinPost        : ${checkinCount}`);
    console.log(`    MakeupCredit       : ${makeupCount}`);

    // 列出 5 筆最近 Booking
    if (bookingCount > 0) {
      const recentBookings = await prisma.booking.findMany({
        where: { customerId: c.id },
        select: {
          id: true,
          bookingDate: true,
          slotTime: true,
          bookingStatus: true,
          bookingType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      console.log(`    最近 Booking:`);
      for (const b of recentBookings) {
        console.log(
          `      - ${b.id} | ${b.bookingDate.toISOString().slice(0, 10)} ${b.slotTime} | ${b.bookingStatus} | ${b.bookingType} | created=${b.createdAt.toISOString()}`,
        );
      }
    }

    // 列 wallet
    if (walletCount > 0) {
      const wallets = await prisma.customerPlanWallet.findMany({
        where: { customerId: c.id },
        select: {
          id: true,
          status: true,
          totalSessions: true,
          remainingSessions: true,
          startDate: true,
          expiryDate: true,
          createdAt: true,
          plan: { select: { name: true, category: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      console.log(`    Wallets:`);
      for (const w of wallets) {
        console.log(
          `      - ${w.id} | ${w.plan.name} (${w.plan.category}) | ${w.status} | ${w.remainingSessions}/${w.totalSessions} | start=${w.startDate.toISOString().slice(0, 10)} expires=${w.expiryDate?.toISOString().slice(0, 10) ?? "n/a"} created=${w.createdAt.toISOString()}`,
        );
      }
    }

    // 列 transaction
    if (txCount > 0) {
      const txs = await prisma.transaction.findMany({
        where: { customerId: c.id },
        select: {
          id: true,
          transactionType: true,
          status: true,
          amount: true,
          paymentMethod: true,
          paymentStatus: true,
          transactionDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      console.log(`    Transactions:`);
      for (const t of txs) {
        console.log(
          `      - ${t.id} | ${t.transactionType} | ${t.status} | $${t.amount.toString()} | ${t.paymentMethod}/${t.paymentStatus} | txDate=${t.transactionDate.toISOString().slice(0, 10)}`,
        );
      }
    }

    // PointRecord
    if (pointCount > 0) {
      const pts = await prisma.pointRecord.findMany({
        where: { customerId: c.id },
        select: { id: true, type: true, points: true, note: true, sourceType: true, sourceKey: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      console.log(`    PointRecord (近 10 筆):`);
      for (const p of pts) {
        console.log(
          `      - ${p.id} | ${p.type} | ${p.points > 0 ? "+" : ""}${p.points} | ${p.sourceType ?? "-"}:${p.sourceKey ?? "-"} | ${p.createdAt.toISOString().slice(0, 10)}`,
        );
      }
    }

    // Referral
    if (referralMadeCount > 0) {
      const refs = await prisma.referral.findMany({
        where: { referrerId: c.id },
        select: { id: true, referredName: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      console.log(`    Referrals 介紹的人:`);
      for (const r of refs) {
        console.log(
          `      - ${r.id} | ${r.referredName} | ${r.status} | ${r.createdAt.toISOString().slice(0, 10)}`,
        );
      }
    }

    // Sponsored
    if (sponsoredCount > 0) {
      const sponsored = await prisma.customer.findMany({
        where: { sponsorId: c.id },
        select: { id: true, name: true, phone: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      console.log(`    Sponsor 旗下顧客:`);
      for (const s of sponsored) {
        console.log(`      - ${s.id} | ${s.name} (${s.phone}) | ${s.createdAt.toISOString().slice(0, 10)}`);
      }
    }

    // MessageLog
    if (msgCount > 0) {
      const msgs = await prisma.messageLog.findMany({
        where: { customerId: c.id },
        select: { id: true, channel: true, status: true, renderedBody: true, createdAt: true, sentAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      console.log(`    最近 MessageLog:`);
      for (const m of msgs) {
        const preview = (m.renderedBody ?? "").slice(0, 40);
        console.log(`      - ${m.id} | ${m.channel} ${m.status} | ${preview} | created=${m.createdAt.toISOString()} sent=${m.sentAt?.toISOString() ?? "-"}`);
      }
    }

    console.log();
  }

  // 2. 額外查 lineUserId 對應的 Account
  console.log(`────────────────────────────────────────`);
  console.log(`【LINE Account 對齊檢查】`);
  for (const c of customers) {
    if (!c.lineUserId) continue;
    const acct = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "line",
          providerAccountId: c.lineUserId,
        },
      },
      select: { id: true, userId: true, providerAccountId: true },
    });
    console.log(
      `  Customer ${c.id} (${c.name}) lineUserId=${c.lineUserId}\n    → Account=${acct ? `id=${acct.id} userId=${acct.userId}` : "(none)"}\n    → Customer.userId=${c.userId}\n    → 對齊？${acct?.userId === c.userId ? "✅" : "❌"}`,
    );
  }

  // 3. 反查：phone canonical Customer 之外，在同一 Store 是否還有別的同名 / LINE-only？
  console.log(`\n────────────────────────────────────────`);
  console.log(`【同店補查 — 找其他可能 placeholder/分裂 record】`);
  const phoneCustomer = customers.find((c) => c.phone === TARGET_PHONE);
  if (phoneCustomer) {
    const sameStoreSimilar = await prisma.customer.findMany({
      where: {
        storeId: phoneCustomer.storeId,
        OR: [
          { name: { contains: TARGET_NAME } },
          { phone: TARGET_PHONE },
          { lineUserId: { in: customers.map((c) => c.lineUserId).filter((x): x is string => !!x) } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        lineUserId: true,
        userId: true,
        authSource: true,
        createdAt: true,
        mergedIntoCustomerId: true,
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`  同店符合條件 Customer：${sameStoreSimilar.length} 筆`);
    for (const s of sameStoreSimilar) {
      console.log(
        `    - ${s.id} | ${s.name} | phone=${s.phone} | lineUserId=${s.lineUserId ?? "-"} | userId=${s.userId ?? "-"} | authSource=${s.authSource} | created=${s.createdAt.toISOString().slice(0, 10)} | merged=${s.mergedIntoCustomerId ?? "-"}`,
      );
    }
  }

  console.log(`\n===== 診斷結束（無寫入）=====`);
}

main()
  .catch((err) => {
    console.error("[diagnose-customer-wuxiaojing] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
