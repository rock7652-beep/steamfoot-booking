/**
 * healthflow-link-dryrun.ts — READ-ONLY
 *
 * PR-H2b-1：批次盤點哪些 Steamfoot Customer 可以安全自動連到 HealthFlow profile。
 *
 * 動機：原 dashboard customer detail 上的 HealthSectionWrapper 因效能考量已不掛回。
 *      改走「系統批次整理 → 顧客頁/LIFF 只讀結果」的架構。本 script 是 sync 前的
 *      第一步：先 dry-run 出可安全寫入名單，再由 PR-H2b-2 正式寫入。
 *
 * 完全 read-only：
 *   ❌ 不 import linkHealthProfile / tryAutoLinkHealth / unlinkHealthProfile
 *   ❌ 不寫 Customer.healthProfileId / healthLinkStatus / healthSyncedAt
 *   ❌ 不寫任何其他 DB row
 *   ❌ 不 migration / seed / deploy
 *   ✅ 對 Steamfoot DB：只 SELECT
 *   ✅ 對 HealthFlow API：只 GET /api/health/profile?email&phone (既有 lookup)
 *
 * 分類 buckets：
 *   AUTO_LINK_CANDIDATE     : 唯一 profile + email + phone 都 hint-match
 *   NEEDS_REVIEW_EMAIL_ONLY : 唯一 profile + 只 email hint-match
 *   NEEDS_REVIEW_PHONE_ONLY : 唯一 profile + 只 phone hint-match
 *   MULTIPLE_CANDIDATES     : 找到 ≥ 2 筆 profile
 *   NOT_FOUND               : HealthFlow 找不到
 *   API_ERROR               : HealthFlow API 失敗
 *   SKIPPED_NO_CONTACT      : Customer 無 email 也無 phone
 *
 * Usage:
 *   # 先看 DB target（會 abort）
 *   npx tsx scripts/healthflow-link-dryrun.ts
 *
 *   # 單一顧客
 *   npx tsx scripts/healthflow-link-dryrun.ts --yes-i-checked-db --customerId cm...
 *
 *   # 限定店 + 限筆數
 *   npx tsx scripts/healthflow-link-dryrun.ts --yes-i-checked-db --storeSlug zhubei --limit 10
 *
 *   # JSON 輸出
 *   npx tsx scripts/healthflow-link-dryrun.ts --yes-i-checked-db --limit 50 --output json
 */

import { PrismaClient } from "@prisma/client";
import { lookupHealthProfile, type HealthProfile } from "@/lib/health-service";

const prisma = new PrismaClient();

type Bucket =
  | "AUTO_LINK_CANDIDATE"
  | "NEEDS_REVIEW_EMAIL_ONLY"
  | "NEEDS_REVIEW_PHONE_ONLY"
  | "MULTIPLE_CANDIDATES"
  | "NOT_FOUND"
  | "API_ERROR"
  | "SKIPPED_NO_CONTACT"
  | "SKIPPED_INVALID_CONTACT";

interface Row {
  bucket: Bucket;
  customerId: string;
  customerName: string;
  storeSlug: string;
  phoneMasked: string;
  emailMasked: string;
  currentLinkStatus: string;
  matchedProfileId: string | null;
  matchedFullName: string | null;
  matchReason: string;
  recommendedAction: string;
}

// ──────────────────────────────────────────
// CLI parsing + safety
// ──────────────────────────────────────────

function describeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: u.port || "default",
      database: u.pathname.slice(1),
      user: u.username,
    };
  } catch {
    return null;
  }
}

function printBanner() {
  const info = describeDatabaseUrl();
  console.log("=".repeat(72));
  console.log("DB target");
  console.log("=".repeat(72));
  console.log(`  host=${info?.host} port=${info?.port} db=${info?.database} user=${info?.user}`);
  console.log(`  HEALTH_API_URL set : ${process.env.HEALTH_API_URL ? "yes" : "NO"}`);
  console.log(`  HEALTH_API_KEY set : ${process.env.HEALTH_API_KEY ? "yes" : "NO"}`);
  console.log("");
}

function abortWithoutConfirm(): never {
  console.error("⛔  未帶 --yes-i-checked-db，abort（純讀，但先確認環境）");
  process.exit(2);
}

interface Args {
  yesChecked: boolean;
  customerId: string | null;
  storeSlug: string | null;
  limit: number;
  output: "table" | "json";
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    yesChecked: false,
    customerId: null,
    storeSlug: null,
    limit: 100,
    output: "table",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--yes-i-checked-db") args.yesChecked = true;
    else if (a === "--customerId" && next) args.customerId = next;
    else if (a === "--storeSlug" && next) args.storeSlug = next;
    else if (a === "--limit" && next) args.limit = parseInt(next, 10) || 100;
    else if (a === "--output" && (next === "json" || next === "table")) args.output = next;
  }
  return args;
}

// ──────────────────────────────────────────
// PII masking
// ──────────────────────────────────────────

function maskEmail(e: string | null): string {
  if (!e) return "(none)";
  const [local, domain] = e.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

function maskPhone(p: string | null): string {
  if (!p) return "(none)";
  if (p.length < 7) return p[0] + "***";
  return `${p.slice(0, 4)}***${p.slice(-3)}`;
}

// ──────────────────────────────────────────
// Contact validation — pre-check before HealthFlow lookup
//
// 動機：Steamfoot OAuth onboarding 會在 phone 留下 `_oauth_line_<hash>` placeholder，
// 打到 HealthFlow API 會回 400（HealthFlow phone 欄位有格式 validation）。
// 預檢一次避免：(1) 浪費 API call (2) 把 customer 誤分到 API_ERROR bucket。
// ──────────────────────────────────────────

/** 嚴格台灣手機：`09` 開頭共 10 碼數字。不接受 placeholder / 空字串 / 含非數字字元。 */
function isValidPhone(p: string | null | undefined): boolean {
  if (!p) return false;
  return /^09\d{8}$/.test(p);
}

/** 基本 email 格式：必含 `@` 且兩側皆有字元。不做嚴格 RFC 5322。 */
function isValidEmail(e: string | null | undefined): boolean {
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ──────────────────────────────────────────
// HealthFlow hint match
// ──────────────────────────────────────────

/**
 * HealthFlow API 回 emailHint = "r***@gmail.com" / phoneHint = "0972***667"
 * 我們不取得明文；只比對 first char + 尾段 + domain。
 * （此為 sanity check：不是 strong identity proof，最終仍可能誤綁；
 *  AUTO_LINK_CANDIDATE 標準只列出兩條 hint 都對的，再交給 PR-H2b-2 二次審查。）
 */
function emailHintMatches(custEmail: string | null, hint: string | null): boolean {
  if (!custEmail || !hint) return false;
  const masked = maskEmail(custEmail);
  return masked === hint || custEmail.toLowerCase().split("@")[1] === hint.split("@")[1] &&
         custEmail[0].toLowerCase() === hint[0].toLowerCase();
}

function phoneHintMatches(custPhone: string | null, hint: string | null): boolean {
  if (!custPhone || !hint) return false;
  const masked = maskPhone(custPhone);
  if (masked === hint) return true;
  // 前 4 + 後 3 對得上即視為 match
  if (custPhone.length < 7 || hint.length < 7) return false;
  const prefix = custPhone.slice(0, 4);
  const suffix = custPhone.slice(-3);
  return hint.startsWith(prefix) && hint.endsWith(suffix);
}

// ──────────────────────────────────────────
// Per-customer classification
// ──────────────────────────────────────────

interface CustomerSlim {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  healthLinkStatus: string;
  store: { slug: string };
}

async function classify(c: CustomerSlim): Promise<Row> {
  const base = {
    customerId: c.id,
    customerName: c.name,
    storeSlug: c.store.slug,
    phoneMasked: maskPhone(c.phone),
    emailMasked: maskEmail(c.email),
    currentLinkStatus: c.healthLinkStatus,
    matchedProfileId: null,
    matchedFullName: null,
  };

  if (!c.email && !c.phone) {
    return {
      ...base,
      bucket: "SKIPPED_NO_CONTACT",
      matchReason: "Customer 無 email 也無 phone",
      recommendedAction: "向顧客索取 email 或 phone 後再 retry",
    };
  }

  // ── 格式預檢：placeholder / 非法格式不要打 HealthFlow API ──
  const emailValid = isValidEmail(c.email);
  const phoneValid = isValidPhone(c.phone);
  if (!emailValid && !phoneValid) {
    const reasons: string[] = [];
    if (c.email && !emailValid) reasons.push(`email "${maskEmail(c.email)}" 非合理格式`);
    if (c.phone && !phoneValid) reasons.push(`phone "${maskPhone(c.phone)}" 非合理格式（須 09xxxxxxxx，placeholder/非數字會被擋）`);
    return {
      ...base,
      bucket: "SKIPPED_INVALID_CONTACT",
      matchReason: reasons.join("；") || "email/phone 皆非合理格式",
      recommendedAction: "請店長修正顧客 email / phone 為合理格式後再 retry（避免 placeholder / OAuth 殘留字串）",
    };
  }

  // 用合法的那個欄位 lookup；非法的傳 undefined（避免打 API 400）。
  const emailForLookup = emailValid ? c.email : undefined;
  const phoneForLookup = phoneValid ? c.phone : undefined;

  let profiles: HealthProfile[];
  try {
    const result = await lookupHealthProfile(emailForLookup, phoneForLookup);
    profiles = result.profiles;
  } catch (err) {
    return {
      ...base,
      bucket: "API_ERROR",
      matchReason: err instanceof Error ? err.message : "unknown error",
      recommendedAction: "稍後重試；確認 HEALTH_API_URL / HEALTH_API_KEY 設定",
    };
  }

  if (profiles.length === 0) {
    return {
      ...base,
      bucket: "NOT_FOUND",
      matchReason: "HealthFlow API 用 email/phone 找不到對應 profile",
      recommendedAction: "顧客可能未在 HealthFlow 完成註冊；或聯絡資訊不一致",
    };
  }

  if (profiles.length > 1) {
    return {
      ...base,
      bucket: "MULTIPLE_CANDIDATES",
      matchedProfileId: profiles.map((p) => p.id).join(","),
      matchedFullName: profiles.map((p) => p.fullName ?? "(no name)").join(","),
      matchReason: `HealthFlow 找到 ${profiles.length} 筆 profile`,
      recommendedAction: "PR-H2b-2 不可自動寫入；建議店長後台手動選擇正確 profileId",
    };
  }

  // Unique profile — classify by hint match
  const profile = profiles[0];
  const emailOk = emailHintMatches(c.email, profile.emailHint);
  const phoneOk = phoneHintMatches(c.phone, profile.phoneHint);

  const matched = {
    ...base,
    matchedProfileId: profile.id,
    matchedFullName: profile.fullName ?? "(no name)",
  };

  if (emailOk && phoneOk) {
    return {
      ...matched,
      bucket: "AUTO_LINK_CANDIDATE",
      matchReason: "唯一 profile + email + phone hint 都對",
      recommendedAction: "PR-H2b-2 可安全寫入 healthProfileId",
    };
  }
  if (emailOk) {
    return {
      ...matched,
      bucket: "NEEDS_REVIEW_EMAIL_ONLY",
      matchReason: "唯一 profile + 只 email hint 對（phone hint 不一致或缺）",
      recommendedAction: "PR-H2b-2 不自動寫入；建議店長確認後手動 link",
    };
  }
  if (phoneOk) {
    return {
      ...matched,
      bucket: "NEEDS_REVIEW_PHONE_ONLY",
      matchReason: "唯一 profile + 只 phone hint 對（email hint 不一致或缺）",
      recommendedAction: "PR-H2b-2 不自動寫入；建議店長確認後手動 link",
    };
  }
  // Hint 都不對：HealthFlow API 用 OR 邏輯查到 profile，但 hint 雙落空
  // 通常是 HealthFlow 端 hint 被遮蔽得太強，仍可能是同一人。歸 NEEDS_REVIEW_EMAIL_ONLY
  // 的 fallback：給 staff 手動確認。
  return {
    ...matched,
    bucket: "NEEDS_REVIEW_EMAIL_ONLY",
    matchReason: "唯一 profile 但 email/phone hint 都對不上（可能 hint 遮蔽太強）",
    recommendedAction: "PR-H2b-2 不自動寫入；建議店長對比 fullName / 性別 / 年齡後手動 link",
  };
}

// ──────────────────────────────────────────
// Output
// ──────────────────────────────────────────

function renderTable(rows: Row[]): void {
  const counts: Record<Bucket, number> = {
    AUTO_LINK_CANDIDATE: 0,
    NEEDS_REVIEW_EMAIL_ONLY: 0,
    NEEDS_REVIEW_PHONE_ONLY: 0,
    MULTIPLE_CANDIDATES: 0,
    NOT_FOUND: 0,
    API_ERROR: 0,
    SKIPPED_NO_CONTACT: 0,
    SKIPPED_INVALID_CONTACT: 0,
  };
  for (const r of rows) counts[r.bucket]++;

  console.log("=".repeat(72));
  console.log("【bucket 統計】");
  console.log("=".repeat(72));
  console.log(`  ✅ AUTO_LINK_CANDIDATE        : ${counts.AUTO_LINK_CANDIDATE}  （可由 PR-H2b-2 安全寫入）`);
  console.log(`  ⚠️ NEEDS_REVIEW_EMAIL_ONLY    : ${counts.NEEDS_REVIEW_EMAIL_ONLY}  （需店長手動 review）`);
  console.log(`  ⚠️ NEEDS_REVIEW_PHONE_ONLY    : ${counts.NEEDS_REVIEW_PHONE_ONLY}  （需店長手動 review）`);
  console.log(`  ⚠️ MULTIPLE_CANDIDATES        : ${counts.MULTIPLE_CANDIDATES}  （HealthFlow 多筆 profile，需手選）`);
  console.log(`  ➖ NOT_FOUND                  : ${counts.NOT_FOUND}`);
  console.log(`  ❌ API_ERROR                  : ${counts.API_ERROR}  （HealthFlow API 真的壞才會出現）`);
  console.log(`  ➖ SKIPPED_NO_CONTACT         : ${counts.SKIPPED_NO_CONTACT}  （顧客無 email 無 phone）`);
  console.log(`  ➖ SKIPPED_INVALID_CONTACT    : ${counts.SKIPPED_INVALID_CONTACT}  （email/phone 格式非法或 placeholder，未打 API）`);
  console.log("");

  console.log("=".repeat(72));
  console.log("【明細】");
  console.log("=".repeat(72));
  for (const r of rows) {
    console.log(`── [${r.bucket}] ${r.customerName} @ ${r.storeSlug}`);
    console.log(`     customerId       = ${r.customerId}`);
    console.log(`     email / phone    = ${r.emailMasked} / ${r.phoneMasked}`);
    console.log(`     currentLinkStat  = ${r.currentLinkStatus}`);
    if (r.matchedProfileId) {
      console.log(`     matched profile  = ${r.matchedProfileId}`);
      console.log(`     matched name     = ${r.matchedFullName}`);
    }
    console.log(`     reason           = ${r.matchReason}`);
    console.log(`     recommend        = ${r.recommendedAction}`);
    console.log("");
  }
}

// ──────────────────────────────────────────
// main
// ──────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.yesChecked) {
    printBanner();
    abortWithoutConfirm();
  }
  printBanner();

  // 1. Build query — 目標：尚未綁定的 Customer
  const baseWhere = {
    mergedIntoCustomerId: null,
    OR: [
      { healthProfileId: null },
      { healthLinkStatus: { in: ["unlinked", "not_found", "error"] } },
    ],
  };

  let where: Record<string, unknown> = baseWhere;

  if (args.customerId) {
    // 單顧客模式：忽略其他 filter（含 storeSlug、含 linkStatus filter）
    where = { id: args.customerId };
  } else if (args.storeSlug) {
    const store = await prisma.store.findUnique({
      where: { slug: args.storeSlug },
      select: { id: true },
    });
    if (!store) {
      console.error(`⛔  找不到 store slug=${args.storeSlug}`);
      process.exit(1);
    }
    where = { ...baseWhere, storeId: store.id };
  }

  // 2. Fetch
  const customers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      healthLinkStatus: true,
      store: { select: { slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take: args.limit,
  });

  console.log(`掃描範圍：${customers.length} 筆 Customer`);
  if (args.customerId) console.log(`  --customerId = ${args.customerId}`);
  if (args.storeSlug) console.log(`  --storeSlug = ${args.storeSlug}`);
  console.log(`  --limit = ${args.limit}`);
  console.log("");

  // 3. Classify — sequential to be polite to HealthFlow API
  const rows: Row[] = [];
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    if (args.output === "table") {
      process.stderr.write(`\r  classifying ${i + 1}/${customers.length}...`);
    }
    const row = await classify(c);
    rows.push(row);
    // 50ms 緩衝 — 不對外部 API spike
    if (i < customers.length - 1) await new Promise((r) => setTimeout(r, 50));
  }
  if (args.output === "table") process.stderr.write("\n\n");

  // 4. Output
  if (args.output === "json") {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    renderTable(rows);
  }
}

main()
  .catch((e) => {
    console.error("[healthflow-link-dryrun] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
