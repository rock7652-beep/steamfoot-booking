/**
 * repair-wuxiaojing-line-drift.ts
 *
 * 收尾 0976118631 / 吳曉菁 兩筆 Customer 的 LINE 身份分裂。
 *
 * 背景（昨天到今天的事件）：
 *   1) 2026-05-05 11:38  店家以 EMAIL 註冊 Customer 1 (phone=0976118631)
 *   2) 2026-05-05 11:44  Customer 1 上 22 堂套餐
 *   3) 2026-05-05 11:45  顧客自助 LINE OAuth 登入 → 因 Customer 1 沒有 lineUserId
 *                         / email / googleId 任何 OAuth 識別碼可比對，auth.ts
 *                         signIn callback 走 fallback「建新 placeholder」分支，
 *                         產生 Customer 2 (phone=_oauth_line_ecc6111a)
 *                         + 新 User (cmoskb3nz...) + Account[line]
 *   4) 2026-05-05 14:05  店家手動產生 Customer 1 綁定碼 JY2TR3
 *   5) 2026-05-05 14:06  店家清掉 Customer 2 的 lineUserId / lineLinkStatus
 *   6) 2026-05-06 02:08  顧客在 LINE OA 輸入「綁定 JY2TR3」→ webhook 把
 *                         Customer 1.lineUserId 設為 U96ad... 並 LINKED ✅
 *
 * 但 webhook 結尾呼叫 syncLineAccountForUser 時：Account[line, U96ad...] 已存在
 * 但 userId 仍指向 Customer 2 的孤兒 User，回傳 skipped_already_linked_other_user。
 * 結果就是「Customer 1 看似已綁，但 Account 還在 Customer 2 的 User 上」的 drift。
 *
 * 這支腳本做：
 *   1) 把 Account[line, U96ad...].userId 從 Customer 2 user 搬到 Customer 1 user
 *   2) 把 Customer 2 標記為已合併進 Customer 1 (mergedIntoCustomerId / mergedAt)
 *   3) 解除 Customer 2.userId（避免兩個 Customer 共享同一 User 的潛在 bug）
 *   4) 把 Customer 2 原本那顆孤兒 User 標 SUSPENDED（無 Customer / 無業務資料）
 *
 * 不刪資料、所有原始 row 全保留，方便事後對照。
 *
 * 用法：
 *   npx tsx scripts/repair-wuxiaojing-line-drift.ts            # DRY RUN
 *   npx tsx scripts/repair-wuxiaojing-line-drift.ts --apply    # 真正寫入
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 鎖定具體 id，避免被誤套到別人身上
const CANONICAL_CUSTOMER_ID = "cmosk1qbt0001l8040ss7ewvo"; // 吳曉菁 / 0976118631
const CANONICAL_USER_ID = "cmnylknn80000gw04ylm0k8sb";
const PLACEHOLDER_CUSTOMER_ID = "cmoskb3o30004l8042qsbjfmn"; // _oauth_line_...
const PLACEHOLDER_USER_ID = "cmoskb3nz0002l804dhh8h1dd";
const LINE_USER_ID = "U96ad908d9fcb06dcdcfb3c22ecc6111a";
const LINE_ACCOUNT_ID = "cmoskb3o90006l804cg0mdxxe";

const APPLY = process.argv.includes("--apply");

function dbHostFromUrl(raw: string | undefined): string {
  if (!raw) return "(DATABASE_URL 未設)";
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "(default)"} db=${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(無法解析)";
  }
}

async function main() {
  console.log(`===== Repair LINE drift for 吳曉菁 (${APPLY ? "APPLY" : "DRY RUN"}) =====\n`);
  console.log(`DATABASE_URL host: ${dbHostFromUrl(process.env.DATABASE_URL)}`);
  console.log(`DIRECT_URL   host: ${dbHostFromUrl(process.env.DIRECT_URL)}\n`);

  // 0) 防呆：再次驗證 row 還是預期狀態
  const [c1, c2, acct, u2] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: CANONICAL_CUSTOMER_ID },
      select: {
        id: true,
        name: true,
        phone: true,
        userId: true,
        lineUserId: true,
        lineLinkStatus: true,
        storeId: true,
      },
    }),
    prisma.customer.findUnique({
      where: { id: PLACEHOLDER_CUSTOMER_ID },
      select: {
        id: true,
        name: true,
        phone: true,
        userId: true,
        lineUserId: true,
        lineLinkStatus: true,
        storeId: true,
        mergedIntoCustomerId: true,
      },
    }),
    prisma.account.findUnique({
      where: { id: LINE_ACCOUNT_ID },
      select: {
        id: true,
        userId: true,
        provider: true,
        providerAccountId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: PLACEHOLDER_USER_ID },
      select: { id: true, name: true, status: true },
    }),
  ]);

  if (!c1 || c1.id !== CANONICAL_CUSTOMER_ID || c1.phone !== "0976118631") {
    throw new Error(`Canonical customer 不符預期：${JSON.stringify(c1)}`);
  }
  if (c1.userId !== CANONICAL_USER_ID) {
    throw new Error(`Canonical Customer.userId 已不再是 ${CANONICAL_USER_ID}：${c1.userId}`);
  }
  if (c1.lineUserId !== LINE_USER_ID || c1.lineLinkStatus !== "LINKED") {
    throw new Error(
      `Canonical Customer 還沒透過綁定碼綁好 LINE，先停手，請先確認顧客已綁。lineUserId=${c1.lineUserId} status=${c1.lineLinkStatus}`,
    );
  }
  if (!c2 || c2.id !== PLACEHOLDER_CUSTOMER_ID || !c2.phone.startsWith("_oauth_line_")) {
    throw new Error(`Placeholder customer 不符預期：${JSON.stringify(c2)}`);
  }
  if (c2.userId !== PLACEHOLDER_USER_ID) {
    throw new Error(
      `Placeholder Customer.userId 已不再是 ${PLACEHOLDER_USER_ID}：${c2.userId}`,
    );
  }
  if (c2.mergedIntoCustomerId) {
    throw new Error(`Placeholder 已標記合併過，停手：${c2.mergedIntoCustomerId}`);
  }
  if (c2.lineUserId) {
    throw new Error(`Placeholder lineUserId 還沒清，停手避免覆寫`);
  }
  if (c2.storeId !== c1.storeId) {
    throw new Error(`Placeholder 與 canonical 不同店：${c2.storeId} vs ${c1.storeId}`);
  }
  if (!acct || acct.providerAccountId !== LINE_USER_ID) {
    throw new Error(`Account drift 預期不符：${JSON.stringify(acct)}`);
  }
  if (acct.userId !== PLACEHOLDER_USER_ID) {
    throw new Error(
      `Account 已不在 placeholder user 上 (${acct.userId})；可能已被別流程修好了，停手避免覆寫`,
    );
  }
  if (!u2) {
    throw new Error(`Placeholder user 找不到：${PLACEHOLDER_USER_ID}`);
  }

  // Phase 1 mergeCustomerIntoCustomer 同店空殼合併會擋 dual userId，
  // 這裡用較窄的、已對 row 狀態 assert 過的手動 SQL 收尾。
  console.log("【Pre-state】");
  console.log("  canonical Customer:", c1);
  console.log("  placeholder Customer:", c2);
  console.log("  drift Account:", acct);
  console.log("  placeholder User:", u2);
  console.log();

  const sourceClearForAudit = {
    customerId: PLACEHOLDER_CUSTOMER_ID,
    plannedMergedInto: CANONICAL_CUSTOMER_ID,
    plannedAccountReassignFrom: PLACEHOLDER_USER_ID,
    plannedAccountReassignTo: CANONICAL_USER_ID,
    plannedUserSuspend: PLACEHOLDER_USER_ID,
  };
  console.log("【Plan】", sourceClearForAudit);
  console.log();

  if (!APPLY) {
    console.log("DRY RUN — 沒有寫入。確認後加 --apply 重跑即真正執行。");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 0) Transaction 內再驗證一次（避免 read 與 apply 之間有別人改動）
    const [bookingCount, walletCount, sessionCount, txCount, pointCount, msgCount, checkinCount, makeupCount, sponsoredCount, referralMadeCount] = await Promise.all([
      tx.booking.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.customerPlanWallet.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.walletSession.count({ where: { wallet: { customerId: PLACEHOLDER_CUSTOMER_ID } } }),
      tx.transaction.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.pointRecord.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.messageLog.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.checkinPost.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.makeupCredit.count({ where: { customerId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.customer.count({ where: { sponsorId: PLACEHOLDER_CUSTOMER_ID } }),
      tx.referral.count({ where: { referrerId: PLACEHOLDER_CUSTOMER_ID } }),
    ]);
    const totals = { bookingCount, walletCount, sessionCount, txCount, pointCount, msgCount, checkinCount, makeupCount, sponsoredCount, referralMadeCount };
    const nonZero = Object.entries(totals).filter(([, v]) => v > 0);
    if (nonZero.length > 0) {
      throw new Error(
        `Placeholder 已不再是空殼（在 transaction 內偵測到業務資料），rollback：${JSON.stringify(totals)}`,
      );
    }
    console.log(`✓ Placeholder 業務資料 in-tx 再驗證仍全為 0：${JSON.stringify(totals)}`);

    // 同步再 assert canonical / placeholder / Account 狀態仍同剛才讀到的
    const [c1Now, c2Now, acctNow] = await Promise.all([
      tx.customer.findUnique({
        where: { id: CANONICAL_CUSTOMER_ID },
        select: { userId: true, lineUserId: true, lineLinkStatus: true, phone: true },
      }),
      tx.customer.findUnique({
        where: { id: PLACEHOLDER_CUSTOMER_ID },
        select: { userId: true, mergedIntoCustomerId: true, lineUserId: true },
      }),
      tx.account.findUnique({
        where: { id: LINE_ACCOUNT_ID },
        select: { userId: true, providerAccountId: true },
      }),
    ]);
    if (c1Now?.userId !== CANONICAL_USER_ID || c1Now?.lineUserId !== LINE_USER_ID || c1Now?.lineLinkStatus !== "LINKED" || c1Now?.phone !== "0976118631") {
      throw new Error(`Canonical row 在 transaction 內狀態已改變，rollback：${JSON.stringify(c1Now)}`);
    }
    if (c2Now?.userId !== PLACEHOLDER_USER_ID || c2Now?.mergedIntoCustomerId != null || c2Now?.lineUserId != null) {
      throw new Error(`Placeholder row 在 transaction 內狀態已改變，rollback：${JSON.stringify(c2Now)}`);
    }
    if (acctNow?.userId !== PLACEHOLDER_USER_ID || acctNow?.providerAccountId !== LINE_USER_ID) {
      throw new Error(`Account row 在 transaction 內狀態已改變，rollback：${JSON.stringify(acctNow)}`);
    }
    console.log(`✓ Canonical / Placeholder / Account in-tx 狀態 assertion 全通過`);

    // 1) Account → 搬到 canonical user
    await tx.account.update({
      where: { id: LINE_ACCOUNT_ID },
      data: { userId: CANONICAL_USER_ID },
    });
    console.log(`✓ Account ${LINE_ACCOUNT_ID}.userId → ${CANONICAL_USER_ID}`);

    // 2) Customer 2 → mergedInto 標記 + userId 解除 + 停權自助
    await tx.customer.update({
      where: { id: PLACEHOLDER_CUSTOMER_ID },
      data: {
        mergedIntoCustomerId: CANONICAL_CUSTOMER_ID,
        mergedAt: new Date(),
        userId: null,
        selfBookingEnabled: false,
        lineLinkStatus: "UNLINKED",
        // 留下 phone=_oauth_line_... / authSource=LINE 作為 audit 痕跡
      },
    });
    console.log(
      `✓ Customer ${PLACEHOLDER_CUSTOMER_ID} marked merged into ${CANONICAL_CUSTOMER_ID}`,
    );

    // 3) 孤兒 User → SUSPENDED（無 Customer 的孤兒，不再讓任何登入流程命中）
    await tx.user.update({
      where: { id: PLACEHOLDER_USER_ID },
      data: { status: "SUSPENDED" },
    });
    console.log(`✓ User ${PLACEHOLDER_USER_ID} → status=SUSPENDED`);
  });

  console.log("\n===== APPLY 完成。請在後台重整顧客頁、再請顧客做一次 LINE 登入測試以驗收。=====");
}

main()
  .catch((err) => {
    console.error("[repair-wuxiaojing-line-drift] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
