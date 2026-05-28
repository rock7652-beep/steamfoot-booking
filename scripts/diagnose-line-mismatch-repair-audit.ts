/**
 * diagnose-line-mismatch-repair-audit.ts — READ-ONLY (PR-F1.2)
 *
 * 目的：對 PR-F1 / PR-F1.1 偵測出的 "account-mismatch"（Account[line].userId
 *       ≠ Customer.userId，同一 lineUserId）做「修復策略判定」的 read-only audit。
 *
 *       PR-F1.1 的 triage 只看 account.user 這側的 bookings / tx，沒有 wallet、
 *       沒有 customer.user 這側的 footprint、也沒有 customer profile 維度，
 *       不足以決定每一筆該走哪種修復路徑。本腳本補上「對稱雙邊 footprint」：
 *
 *         對每一筆 mismatch，分別查
 *           (C) customer.user 對應的 Customer
 *           (A) account.user 對應的 Customer（若有）
 *         的 booking / transaction / wallet / customer-profile 與其他關聯資料，
 *         判斷哪一邊是主要顧客、哪一邊像 LINE OAuth 空殼，並輸出四選一建議：
 *
 *           - safe_reassign_account_only   只需把 Account[line].userId 指回
 *                                          customer.userId；account.user 是純空殼
 *                                          User（無 Customer / 無密碼 / 無其他帳號）
 *           - needs_customer_merge         可 reassign，但 account.user 底下還掛了
 *                                          一筆空殼 Customer，需要一併 merge /
 *                                          deactivate（chenjiajia 模式）
 *           - do_not_touch                 兩邊都無實質資料、無法判斷且風險低，
 *                                          維持 known-split、先觀察
 *           - needs_manual_business_check  雙邊都有實質資料、方向相反、或訊號衝突，
 *                                          必須人工 / 業務確認
 *
 * 用法：
 *   npx tsx scripts/diagnose-line-mismatch-repair-audit.ts                 # 全店, masked
 *   npx tsx scripts/diagnose-line-mismatch-repair-audit.ts --store=zhubei  # 限竹北店
 *   npx tsx scripts/diagnose-line-mismatch-repair-audit.ts --store=zhubei --verbose
 *
 * 安全（與 diagnose-line-identity-drift.ts 相同契約）：
 *   - 只做 Prisma read（findUnique / findFirst / findMany / count），不寫 DB
 *   - 不開 $transaction（只允許 $disconnect）
 *   - 不接受 --apply / --execute / --confirm-write 等任何寫入 flag
 *   - 不 import 任何 repair / backfill / merge / bind / sync 服務
 *   - 所有輸出 mask（maskLineUserId / maskId / maskPhone）；不印 name / email /
 *     完整 lineUserId / 完整 phone / 任何 secret；passwordHash 只輸出 boolean
 *   - 不寫 migration、不改 schema
 *
 * 本腳本「不」執行任何修復，只給判定與理由。
 */
import { PrismaClient } from "@prisma/client";
// NOTE: maskPhone is intentionally not imported. This audit derives a
// `placeholderPhone` boolean from Customer.phone (see isPlaceholderPhone)
// but never prints the raw phone value in any output. The
// read-only contract test asserts no `${...phone...}` template ever lands
// in the script.
import { maskLineUserId, maskId } from "../src/lib/line-bind-log";

const prisma = new PrismaClient();

const storeFilterArg = process.argv.find((a) => a.startsWith("--store="));
const STORE_SLUG_FILTER = storeFilterArg?.split("=")[1] ?? null;
const VERBOSE = process.argv.includes("--verbose");

type Recommendation =
  | "safe_reassign_account_only"
  | "needs_customer_merge"
  | "do_not_touch"
  | "needs_manual_business_check";

/** 顧客側資料足跡（皆為 count；不含任何 PII）。 */
type Footprint = {
  present: boolean; // 該 userId 底下是否有 Customer row
  placeholderPhone: boolean; // phone 以 _oauth_line_ 開頭（LINE OAuth fallback 產生）
  bookings: number;
  transactions: number;
  walletsTotal: number; // CustomerPlanWallet 全部
  walletsActive: number; // status=ACTIVE
  walletSessions: number;
  points: number;
  messages: number;
  checkins: number;
  makeupCredits: number;
  sponsored: number; // 以此人為 sponsor 的下線數
  referralsMade: number;
};

const EMPTY_FOOTPRINT: Footprint = {
  present: false,
  placeholderPhone: false,
  bookings: 0,
  transactions: 0,
  walletsTotal: 0,
  walletsActive: 0,
  walletSessions: 0,
  points: 0,
  messages: 0,
  checkins: 0,
  makeupCredits: 0,
  sponsored: 0,
  referralsMade: 0,
};

type UserSide = {
  exists: boolean;
  hasPwd: boolean;
  status: string | null;
  createdAt: Date | null;
  /** 此 User 底下、排除「問題中的 LINE Account」之後，還剩幾個 Account（Google / 其他 LINE）。 */
  otherAccounts: number;
  /** 此 User 是否擁有 Customer（1:1）。 */
  hasCustomer: boolean;
  customerId: string | null;
};

type RecordAudit = {
  customerId: string;
  storeSlug: string;
  lineUserId: string;
  customerUserId: string;
  accountUserId: string;
  lineAccountId: string;
  // C 側 = customer.user 對應的 Customer（就是這筆 candidate 本身）
  cUser: UserSide;
  cFoot: Footprint;
  // A 側 = account.user 對應的 Customer（可能不存在）
  aUser: UserSide;
  aFoot: Footprint;
  // 判定
  primarySide: "customer" | "account" | "both" | "neither";
  shellSide: "account" | "customer" | "none" | "both";
  canReassignSafely: boolean;
  accountCustomerDisposition:
    | "no_customer_nothing_to_do"
    | "shell_merge_deactivate"
    | "has_real_data_manual_merge"
    | "ambiguous";
  recommendation: Recommendation;
  reasons: string[];
};

function isPlaceholderPhone(phone: string | null | undefined): boolean {
  return !!phone && phone.startsWith("_oauth_line_");
}

/** 經濟足跡：有預約 / 交易 / 任何錢包 → 視為「真實顧客」。 */
function hasEconomicFootprint(f: Footprint): boolean {
  return f.bookings > 0 || f.transactions > 0 || f.walletsTotal > 0;
}

/** 廣義足跡：經濟足跡 + 積分 / 訊息 / 打卡 / 補課 / 下線 / 轉介紹。 */
function hasAnyFootprint(f: Footprint): boolean {
  return (
    hasEconomicFootprint(f) ||
    f.points > 0 ||
    f.messages > 0 ||
    f.checkins > 0 ||
    f.makeupCredits > 0 ||
    f.sponsored > 0 ||
    f.referralsMade > 0
  );
}

function dbHostFromUrl(raw: string | undefined): string {
  if (!raw) return "(DATABASE_URL 未設)";
  try {
    const u = new URL(raw);
    // 只印 hostname:port + db 名；不含 user / password。
    return `${u.hostname}:${u.port || "(default)"} db=${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(無法解析)";
  }
}

async function loadFootprint(customerId: string | null): Promise<Footprint> {
  if (!customerId) return { ...EMPTY_FOOTPRINT };
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true },
  });
  if (!customer) return { ...EMPTY_FOOTPRINT };

  const [
    bookings,
    transactions,
    walletsTotal,
    walletsActive,
    walletSessions,
    points,
    messages,
    checkins,
    makeupCredits,
    sponsored,
    referralsMade,
  ] = await Promise.all([
    prisma.booking.count({ where: { customerId } }),
    prisma.transaction.count({ where: { customerId } }),
    prisma.customerPlanWallet.count({ where: { customerId } }),
    prisma.customerPlanWallet.count({ where: { customerId, status: "ACTIVE" } }),
    prisma.walletSession.count({ where: { wallet: { customerId } } }),
    prisma.pointRecord.count({ where: { customerId } }),
    prisma.messageLog.count({ where: { customerId } }),
    prisma.checkinPost.count({ where: { customerId } }),
    prisma.makeupCredit.count({ where: { customerId } }),
    prisma.customer.count({ where: { sponsorId: customerId } }),
    prisma.referral.count({ where: { referrerId: customerId } }),
  ]);

  return {
    present: true,
    placeholderPhone: isPlaceholderPhone(customer.phone),
    bookings,
    transactions,
    walletsTotal,
    walletsActive,
    walletSessions,
    points,
    messages,
    checkins,
    makeupCredits,
    sponsored,
    referralsMade,
  };
}

async function loadUserSide(
  userId: string,
  thisLineUserId: string,
): Promise<UserSide> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      passwordHash: true,
      status: true,
      customer: { select: { id: true } },
    },
  });
  if (!user) {
    return {
      exists: false,
      hasPwd: false,
      status: null,
      createdAt: null,
      otherAccounts: 0,
      hasCustomer: false,
      customerId: null,
    };
  }
  const otherAccounts = await prisma.account.count({
    where: {
      userId,
      NOT: { AND: [{ provider: "line" }, { providerAccountId: thisLineUserId }] },
    },
  });
  return {
    exists: true,
    hasPwd: !!user.passwordHash,
    status: user.status,
    createdAt: user.createdAt,
    otherAccounts,
    hasCustomer: !!user.customer,
    customerId: user.customer?.id ?? null,
  };
}

/**
 * 依雙邊 footprint 推導建議。保守原則：只有在「C 側明確是主要顧客、A 側明確是
 * 空殼」時才給可自動化的建議；其餘一律升級為 needs_manual_business_check 或
 * do_not_touch。
 *
 * PR-F1.2 Codex P1 cross-store guard:
 *   `crossStoreLineUserCount` = distinct stores containing this lineUserId
 *   (non-merged Customer rows). If > 1, naive `safe_reassign_account_only`
 *   is unsafe because the same LINE identity appears in multiple stores —
 *   reassigning the Account would silently affect cross-store routing.
 *   Downgrade to `needs_manual_business_check` with explicit reason. Default
 *   value 1 keeps behaviour unchanged for callers that don't supply it.
 */
function classify(input: {
  cUser: UserSide;
  cFoot: Footprint;
  aUser: UserSide;
  aFoot: Footprint;
  /** distinct store count containing this lineUserId in non-merged Customer rows. Default 1 = single-store. */
  crossStoreLineUserCount?: number;
}): {
  primarySide: RecordAudit["primarySide"];
  shellSide: RecordAudit["shellSide"];
  canReassignSafely: boolean;
  accountCustomerDisposition: RecordAudit["accountCustomerDisposition"];
  recommendation: Recommendation;
  reasons: string[];
} {
  const { cUser, cFoot, aUser, aFoot } = input;
  const crossStoreLineUserCount = input.crossStoreLineUserCount ?? 1;
  const reasons: string[] = [];

  const cReal = hasEconomicFootprint(cFoot);
  const aReal = hasEconomicFootprint(aFoot);
  const cAny = hasAnyFootprint(cFoot);
  const aAny = hasAnyFootprint(aFoot);

  // primary / shell 判定（以經濟足跡為主）
  let primarySide: RecordAudit["primarySide"];
  if (cReal && aReal) primarySide = "both";
  else if (cReal) primarySide = "customer";
  else if (aReal) primarySide = "account";
  else primarySide = "neither";

  // 空殼判定：無任何足跡 + 無密碼 +（無 Customer 或 placeholder phone）
  const cIsShell =
    !cAny && !cUser.hasPwd && (!cFoot.present || cFoot.placeholderPhone);
  const aIsShell =
    !aAny &&
    !aUser.hasPwd &&
    aUser.otherAccounts === 0 &&
    (!aFoot.present || aFoot.placeholderPhone);

  let shellSide: RecordAudit["shellSide"];
  if (aIsShell && cIsShell) shellSide = "both";
  else if (aIsShell) shellSide = "account";
  else if (cIsShell) shellSide = "customer";
  else shellSide = "none";

  // account.user 底下的 Customer 該怎麼處理？
  let accountCustomerDisposition: RecordAudit["accountCustomerDisposition"];
  if (!aUser.hasCustomer) {
    accountCustomerDisposition = "no_customer_nothing_to_do";
  } else if (aReal) {
    accountCustomerDisposition = "has_real_data_manual_merge";
  } else if (aIsShell) {
    accountCustomerDisposition = "shell_merge_deactivate";
  } else {
    accountCustomerDisposition = "ambiguous";
  }

  // ── 決策樹（保守） ───────────────────────────────────
  let recommendation: Recommendation;
  let canReassignSafely = false;

  if (!aUser.exists) {
    // Account.userId FK → User，理論上一定存在；缺失代表資料完整性異常。
    recommendation = "needs_manual_business_check";
    reasons.push("account_user_missing(FK 異常，需人工查資料完整性)");
  } else if (cReal && !aUser.hasCustomer && !aUser.hasPwd && aUser.otherAccounts === 0) {
    // A 是純空殼 User：沒有 Customer、沒有密碼、沒有其他帳號。
    // 跨店 guard 統一在決策樹結尾處理（見下方 PR-F1.2 Codex P1 v2 區塊）。
    recommendation = "safe_reassign_account_only";
    canReassignSafely = true;
    reasons.push("customer_side_primary(有經濟足跡)");
    reasons.push("account_user_bare_empty_shell(無 Customer / 無密碼 / 無其他帳號)");
  } else if (cReal && accountCustomerDisposition === "shell_merge_deactivate") {
    // chenjiajia 模式：A 底下掛一筆 placeholder 空殼 Customer。
    // 跨店 guard 統一在決策樹結尾處理（見下方 PR-F1.2 Codex P1 v2 區塊）。
    recommendation = "needs_customer_merge";
    canReassignSafely = true; // Account pointer 本身可安全搬，但需連同空殼一起收尾
    reasons.push("customer_side_primary(有經濟足跡)");
    reasons.push("account_side_shell_customer(placeholder phone + 零足跡 + 無密碼)");
    reasons.push("reassign 後須 merge/deactivate 空殼 Customer 並停權孤兒 User");
  } else if (cReal && aReal) {
    // 雙邊都有真實資料：可能同一人重複付費，或根本是兩個人。
    recommendation = "needs_manual_business_check";
    reasons.push("both_sides_have_economic_footprint(雙邊皆有預約/交易/錢包)");
    reasons.push("需業務確認是否同一人、以及財務資料如何合併");
  } else if (cReal && aUser.hasCustomer && !aReal) {
    // A 有 Customer 但無經濟足跡，且不是乾淨空殼（有密碼或有其他帳號）。
    recommendation = "needs_manual_business_check";
    reasons.push("customer_side_primary(有經濟足跡)");
    reasons.push(
      "account_user_is_live_login_without_data(有密碼或其他帳號，reassign 會孤立該登入身份)",
    );
  } else if (!cReal && aReal) {
    // 方向相反：真實資料在 account.user 這側，customer.user 這側才是空殼。
    recommendation = "needs_manual_business_check";
    reasons.push("direction_flipped(真實顧客在 account.user 側)");
    reasons.push("把 Account 指回 customer.userId 會指向空殼，naive reassign 不安全");
  } else if (!cReal && !aReal && !cUser.hasPwd && !aUser.hasPwd) {
    // 雙邊都無經濟足跡、都無密碼：known-split，無資料可救，風險低。
    recommendation = "do_not_touch";
    reasons.push("both_sides_low_value(雙邊皆無經濟足跡、無密碼)");
    reasons.push("維持 known-split，先觀察，不值得冒寫入風險");
  } else {
    recommendation = "needs_manual_business_check";
    reasons.push("signals_inconclusive(訊號不足以自動判定)");
  }

  // ── PR-F1.2 Codex P1 v2: unified cross-store guard ──────────────────
  //
  // 任何「自動安全可執行」的建議（canReassignSafely=true）— 不論是
  // safe_reassign_account_only 或 needs_customer_merge — 在 lineUserId
  // 跨店時都不安全：LINE Account 是全域 unique (provider, providerAccountId)，
  // 同一個 lineUserId 卻分佈在多個 store 的 Customer 上時，搬 Account.userId
  // 會無聲影響其他店的身份路由。
  //
  // 把這個 guard 從原本內嵌在 safe_reassign_account_only 分支提到決策樹之後
  // 的單一覆寫，可以同時涵蓋現有 (safe_reassign / needs_customer_merge) 與
  // 未來新增的任何 auto-safe 路徑，避免 Codex P1 再次出現。
  if (crossStoreLineUserCount > 1 && canReassignSafely) {
    reasons.push(
      `cross_store_line_user_detected(distinctStores=${crossStoreLineUserCount}; ` +
        `same_line_user_multiple_stores — naive ${recommendation} unsafe across stores; ` +
        `downgraded to needs_manual_business_check)`,
    );
    recommendation = "needs_manual_business_check";
    canReassignSafely = false;
  }

  return {
    primarySide,
    shellSide,
    canReassignSafely,
    accountCustomerDisposition,
    recommendation,
    reasons,
  };
}

function fmtDate(d: Date | null): string {
  if (!d) return "(missing)";
  return d.toISOString().slice(0, 19) + "Z";
}

function footprintLine(label: string, f: Footprint): string {
  if (!f.present) return `      ${label}: (no Customer row)`;
  return (
    `      ${label}: profile=${f.present ? (f.placeholderPhone ? "placeholder" : "real") : "none"}` +
    ` bookings=${f.bookings} tx=${f.transactions}` +
    ` wallets=${f.walletsTotal}(active ${f.walletsActive}) sessions=${f.walletSessions}` +
    (VERBOSE
      ? ` points=${f.points} msg=${f.messages} checkin=${f.checkins}` +
        ` makeup=${f.makeupCredits} sponsored=${f.sponsored} referrals=${f.referralsMade}`
      : "")
  );
}

function printRecord(r: RecordAudit, idx: number): void {
  console.log(
    `\n[${idx}] customerId=${maskId(r.customerId)} store=${r.storeSlug} lineUserId=${maskLineUserId(r.lineUserId)}`,
  );
  console.log(
    `    customer.userId=${maskId(r.customerUserId)} hasPwd=${r.cUser.hasPwd}` +
      ` status=${r.cUser.status} created=${fmtDate(r.cUser.createdAt)}` +
      ` otherAccts=${r.cUser.otherAccounts}`,
  );
  console.log(footprintLine("C(customer.user) footprint", r.cFoot));
  console.log(
    `    account.userId=${maskId(r.accountUserId)} hasPwd=${r.aUser.hasPwd}` +
      ` status=${r.aUser.status ?? "(missing)"} created=${fmtDate(r.aUser.createdAt)}` +
      ` otherAccts=${r.aUser.otherAccounts} hasCustomer=${r.aUser.hasCustomer}`,
  );
  console.log(footprintLine("A(account.user) footprint", r.aFoot));
  console.log(
    `    → primary=${r.primarySide} shell=${r.shellSide}` +
      ` canReassignSafely=${r.canReassignSafely}` +
      ` account.customer=${r.accountCustomerDisposition}`,
  );
  console.log(`    → recommendation=${r.recommendation}`);
  console.log(`      reasons: ${r.reasons.join("; ")}`);
}

function printSummaryTable(records: RecordAudit[]): void {
  console.log("\n\n===== Summary table (masked) =====");
  const header = [
    "#",
    "store",
    "lineUserId",
    "customerId",
    "C:bk/tx/wlt",
    "C.pwd",
    "A:has/bk/tx/wlt",
    "A.pwd",
    "primary",
    "shell",
    "reassign?",
    "acct.customer",
    "recommendation",
  ];
  console.log(header.join(" | "));
  console.log(header.map(() => "---").join(" | "));
  records.forEach((r, i) => {
    const cTriple = `${r.cFoot.bookings}/${r.cFoot.transactions}/${r.cFoot.walletsTotal}`;
    const aTriple = r.aUser.hasCustomer
      ? `Y:${r.aFoot.bookings}/${r.aFoot.transactions}/${r.aFoot.walletsTotal}`
      : "N:-/-/-";
    console.log(
      [
        String(i + 1),
        r.storeSlug,
        maskLineUserId(r.lineUserId),
        maskId(r.customerId),
        cTriple,
        String(r.cUser.hasPwd),
        aTriple,
        String(r.aUser.hasPwd),
        r.primarySide,
        r.shellSide,
        String(r.canReassignSafely),
        r.accountCustomerDisposition,
        r.recommendation,
      ].join(" | "),
    );
  });

  // 各建議計數
  const tally = records.reduce(
    (acc, r) => {
      acc[r.recommendation] = (acc[r.recommendation] ?? 0) + 1;
      return acc;
    },
    {} as Record<Recommendation, number>,
  );
  console.log("\n  recommendation tally:");
  for (const [rec, n] of Object.entries(tally)) {
    console.log(`    - ${rec}: ${n}`);
  }
  console.log(
    "\n  legend: C=customer.user 側 Customer; A=account.user 側 Customer;" +
      " bk=bookings tx=transactions wlt=wallets(total).",
  );
  console.log(
    "  reminder: 本報告為 read-only audit，未執行任何修復；建議僅供後續人工決策參考。",
  );
}

async function main() {
  console.log(
    "===== LINE account-mismatch Repair-Decision Audit (READ-ONLY, masked, PR-F1.2) =====\n",
  );
  console.log(`DATABASE_URL host: ${dbHostFromUrl(process.env.DATABASE_URL)}`);
  console.log(`DIRECT_URL   host: ${dbHostFromUrl(process.env.DIRECT_URL)}\n`);

  const stores = await prisma.store.findMany({
    select: { id: true, slug: true },
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
    console.log(`Filtering to store: ${s.slug}\n`);
  }

  // 候選：lineUserId + userId 皆有、未被合併。
  const candidates = await prisma.customer.findMany({
    where: {
      lineUserId: { not: null },
      userId: { not: null },
      mergedIntoCustomerId: null,
      ...(storeIdFilter ? { storeId: storeIdFilter } : {}),
    },
    select: { id: true, storeId: true, userId: true, lineUserId: true },
  });

  const records: RecordAudit[] = [];

  for (const c of candidates) {
    if (!c.lineUserId || !c.userId) continue;
    const acct = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "line",
          providerAccountId: c.lineUserId,
        },
      },
      select: { id: true, userId: true },
    });
    if (!acct || acct.userId === c.userId) continue; // 非 mismatch

    // 雙邊 user-side + footprint
    const [cUser, aUser] = await Promise.all([
      loadUserSide(c.userId, c.lineUserId),
      loadUserSide(acct.userId, c.lineUserId),
    ]);
    const [cFoot, aFoot] = await Promise.all([
      loadFootprint(cUser.customerId ?? c.id),
      loadFootprint(aUser.customerId),
    ]);

    // PR-F1.2 Codex P1: count distinct stores containing this lineUserId in
    // non-merged Customer rows. Used to guard the safe_reassign_account_only
    // path from cross-store identity races. Read-only.
    const crossStoreRows = await prisma.customer.findMany({
      where: {
        lineUserId: c.lineUserId,
        mergedIntoCustomerId: null,
      },
      select: { storeId: true },
      distinct: ["storeId"],
    });
    const crossStoreLineUserCount = crossStoreRows.length;

    const verdict = classify({
      cUser,
      cFoot,
      aUser,
      aFoot,
      crossStoreLineUserCount,
    });

    records.push({
      customerId: c.id,
      storeSlug: storeMap.get(c.storeId)?.slug ?? "?",
      lineUserId: c.lineUserId,
      customerUserId: c.userId,
      accountUserId: acct.userId,
      lineAccountId: acct.id,
      cUser,
      cFoot,
      aUser,
      aFoot,
      ...verdict,
    });
  }

  console.log(`──── account-mismatch records found: ${records.length} ────`);
  if (records.length === 0) {
    console.log("\n✓ 沒有 account-mismatch（Account[line].userId 與 Customer.userId 全對齊）。");
    return;
  }

  records.forEach((r, i) => printRecord(r, i + 1));
  printSummaryTable(records);
}

// 只有「直接執行」這支腳本時才連 DB 跑 main()；被 import（例如 logic 驗證）時不連線。
const runDirectly =
  !!process.argv[1] && /diagnose-line-mismatch-repair-audit/.test(process.argv[1]);

if (runDirectly) {
  main()
    .catch((err) => {
      console.error("[diagnose-line-mismatch-repair-audit] failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 供 read-only 邏輯驗證使用（不含任何 DB 連線）。
export { classify, hasEconomicFootprint, hasAnyFootprint, isPlaceholderPhone };
export type { Footprint, UserSide, Recommendation };
