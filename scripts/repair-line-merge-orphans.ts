/**
 * 修復：LINE OAuth merge 遺漏的身份欄位
 *
 * 安全規則（2026-04-21 強化）
 *   - 必須帶 STORE_ID（可為 slug 或 cuid），不允許全庫掃描
 *   - 必須 DRY_RUN=1；若要實跑需額外設 CONFIRM_WRITE=1
 *   - log 會遮罩 email / lineUserId / userId，避免敏感資料外洩
 *
 * 背景
 *   早期 profile.ts merge 只搬 name/phone/email，漏搬 LINE/Google 身份欄位，
 *   造成真人 row 顯示「未綁定」，而 OAuth placeholder row（userId=null）
 *   卻帶著完整 LINE 欄位變成孤兒。
 *
 * 掃描類型
 *   A：orphan placeholder — phone LIKE "_oauth_%" AND userId IS NULL AND 帶身份欄位
 *   B：真人 row 缺 LINE   — userId IS NOT NULL AND lineUserId IS NULL
 *   C：authSource 來源錯  — authSource = EMAIL 但 user 有 LINE/Google Account
 *
 * 修復動作
 *   A+B 配對（email 匹配）：呼叫 mergePlaceholderCustomerIntoRealCustomer()
 *   C：update real.authSource
 *   無法配對的 A：列為「需人工判斷」，不動
 *
 * 執行方式
 *   DRY_RUN=1 STORE_ID=zhubei pnpm tsx scripts/repair-line-merge-orphans.ts
 *   DRY_RUN=1 CONFIRM_WRITE=1 STORE_ID=zhubei pnpm tsx scripts/repair-line-merge-orphans.ts
 *
 * 可重跑性
 *   A+B 修完後 placeholder 已刪或 unique 欄位清空，下次執行跳過
 *   C 修完後 authSource 不再 EMAIL，下次跳過
 */
import { prisma } from "../src/lib/db";
import { mergePlaceholderCustomerIntoRealCustomer } from "../src/server/services/customer-merge";
import type { AuthSource } from "@prisma/client";

// ── Safety gate ────────────────────────────────────────
const DRY_RUN = process.env.DRY_RUN === "1";
const CONFIRM_WRITE = process.env.CONFIRM_WRITE === "1";
const STORE_KEY = process.env.STORE_ID ?? null;

if (!STORE_KEY) {
  console.error(
    "ERROR: 必須指定 STORE_ID=<slug or cuid>。禁止全庫掃描。\n" +
      "  範例：DRY_RUN=1 STORE_ID=zhubei pnpm tsx scripts/repair-line-merge-orphans.ts",
  );
  process.exit(1);
}

if (!DRY_RUN && !CONFIRM_WRITE) {
  console.error(
    "ERROR: 未設定 DRY_RUN=1，也未設定 CONFIRM_WRITE=1。\n" +
      "  安全檢查：預設拒絕寫入。\n" +
      "  只掃描：DRY_RUN=1 STORE_ID=... pnpm tsx scripts/repair-line-merge-orphans.ts\n" +
      "  實寫入：CONFIRM_WRITE=1 STORE_ID=... pnpm tsx scripts/repair-line-merge-orphans.ts",
  );
  process.exit(1);
}

// ── Mask helpers ───────────────────────────────────────
function maskEmail(e: string | null | undefined): string {
  if (!e) return "(null)";
  const [u, d] = e.split("@");
  if (!d) return `${u.slice(0, 2)}***`;
  const uMasked = u.length <= 2 ? `${u[0] ?? ""}*` : `${u.slice(0, 2)}***`;
  return `${uMasked}@${d}`;
}

function maskId(id: string | null | undefined, keep = 4): string {
  if (!id) return "(null)";
  if (id.length <= keep * 2) return id.slice(0, keep) + "****";
  return id.slice(0, keep) + "****" + id.slice(-keep);
}

type Counters = {
  scannedOrphans: number;
  scannedRealMissing: number;
  paired: number;
  repaired: number;
  needsManual: number;
  authSourceCandidates: number;
  authSourceFixed: number;
  errors: number;
};

function normalizeEmail(e: string | null | undefined): string | null {
  const t = (e ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.endsWith("@line.local")) return null;
  return t;
}

async function resolveStore(): Promise<{ id: string; slug: string; name: string }> {
  // 先試 slug，再試 cuid
  const bySlug = await prisma.store.findUnique({
    where: { slug: STORE_KEY! },
    select: { id: true, slug: true, name: true },
  });
  if (bySlug) return bySlug;
  const byId = await prisma.store.findUnique({
    where: { id: STORE_KEY! },
    select: { id: true, slug: true, name: true },
  });
  if (byId) return byId;
  console.error(`ERROR: 找不到 store（slug 或 id = ${STORE_KEY}）`);
  process.exit(1);
}

async function repairStore(storeId: string, counters: Counters): Promise<void> {
  // 類型 A
  const orphans = await prisma.customer.findMany({
    where: {
      storeId,
      userId: null,
      phone: { startsWith: "_oauth_" },
      OR: [
        { lineUserId: { not: null } },
        { googleId: { not: null } },
        { lineName: { not: null } },
      ],
    },
    select: {
      id: true,
      email: true,
      lineUserId: true,
      googleId: true,
      lineName: true,
      lineLinkStatus: true,
      lineLinkedAt: true,
      authSource: true,
      createdAt: true,
    },
  });
  counters.scannedOrphans += orphans.length;
  console.log(`  類型 A orphans (placeholder 帶身份欄位): ${orphans.length}`);

  // 類型 B
  const reals = await prisma.customer.findMany({
    where: {
      storeId,
      userId: { not: null },
      lineUserId: null,
      phone: { not: { startsWith: "_oauth_" } },
    },
    select: {
      id: true,
      userId: true,
      email: true,
      authSource: true,
    },
  });
  counters.scannedRealMissing += reals.length;
  console.log(`  類型 B real 缺 LINE 綁定: ${reals.length}`);

  // 建 email → real 索引
  const realByEmail = new Map<string, typeof reals[number]>();
  const duplicatedEmails = new Set<string>();
  for (const r of reals) {
    const key = normalizeEmail(r.email);
    if (!key) continue;
    if (realByEmail.has(key)) {
      duplicatedEmails.add(key);
      continue;
    }
    realByEmail.set(key, r);
  }
  if (duplicatedEmails.size > 0) {
    console.warn(
      `  [warn] 同 email 多筆真人 row (異常 pattern): ${duplicatedEmails.size} 組`,
    );
  }

  // 配對 A + B
  for (const orphan of orphans) {
    const key = normalizeEmail(orphan.email);
    if (!key) {
      counters.needsManual++;
      console.log(
        `    [manual] orphan=${maskId(orphan.id)} email=null line=${maskId(orphan.lineUserId, 4)} google=${maskId(orphan.googleId, 4)} 無 email 無法配對`,
      );
      continue;
    }
    if (duplicatedEmails.has(key)) {
      counters.needsManual++;
      console.log(
        `    [manual] orphan=${maskId(orphan.id)} email=${maskEmail(orphan.email)} 對應同 email 多筆真人 row — 需人工判斷`,
      );
      continue;
    }
    const real = realByEmail.get(key);
    if (!real) {
      counters.needsManual++;
      console.log(
        `    [manual] orphan=${maskId(orphan.id)} email=${maskEmail(orphan.email)} 找不到真人 row`,
      );
      continue;
    }

    counters.paired++;
    console.log(
      `    [pair] orphan=${maskId(orphan.id)} → real=${maskId(real.id)} ` +
        `email=${maskEmail(orphan.email)} line=${maskId(orphan.lineUserId, 4)} ` +
        `status=${orphan.lineLinkStatus}`,
    );

    if (DRY_RUN) continue;

    try {
      const result = await mergePlaceholderCustomerIntoRealCustomer({
        placeholderCustomerId: orphan.id,
        realCustomerId: real.id,
        userId: real.userId!,
      });
      counters.repaired++;
      console.log(
        `      [ok] merged identityKeys=[${Object.keys(result.mergedIdentity).join(",")}] ` +
          `deleted=${result.placeholderDeleted} cleared=${result.placeholderClearedInPlace} ` +
          `skipped=${result.skippedReason ?? "-"}`,
      );
    } catch (err) {
      counters.errors++;
      console.error(`      [error] merge failed`, {
        orphanId: maskId(orphan.id),
        realId: maskId(real.id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 類型 C — authSource 修正
  const suspectEmailSource = await prisma.customer.findMany({
    where: {
      storeId,
      userId: { not: null },
      authSource: "EMAIL",
    },
    select: { id: true, userId: true },
  });

  for (const c of suspectEmailSource) {
    if (!c.userId) continue;
    const accounts = await prisma.account.findMany({
      where: { userId: c.userId },
      select: { provider: true },
    });
    if (accounts.length === 0) continue;
    let nextSource: AuthSource = "EMAIL";
    if (accounts.some((a) => a.provider === "line")) nextSource = "LINE";
    else if (accounts.some((a) => a.provider === "google")) nextSource = "GOOGLE";
    if (nextSource === "EMAIL") continue;

    counters.authSourceCandidates++;
    console.log(`    [authSource] customer=${maskId(c.id)} EMAIL → ${nextSource}`);

    if (DRY_RUN) continue;

    try {
      await prisma.customer.update({
        where: { id: c.id },
        data: { authSource: nextSource },
      });
      counters.authSourceFixed++;
    } catch (err) {
      counters.errors++;
      console.error(`      [error] authSource update failed`, {
        customerId: maskId(c.id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function main() {
  console.log(`=== repair-line-merge-orphans ===`);
  console.log(`mode          : ${DRY_RUN ? "DRY_RUN (read only)" : "WRITE (CONFIRM_WRITE=1)"}`);
  const store = await resolveStore();
  console.log(`store         : ${store.slug} (${maskId(store.id, 6)}) — ${store.name}`);
  console.log();

  const counters: Counters = {
    scannedOrphans: 0,
    scannedRealMissing: 0,
    paired: 0,
    repaired: 0,
    needsManual: 0,
    authSourceCandidates: 0,
    authSourceFixed: 0,
    errors: 0,
  };

  await repairStore(store.id, counters);

  console.log(`\n=== summary ===`);
  console.log(`  scanned orphans (A)           : ${counters.scannedOrphans}`);
  console.log(`  scanned real missing LINE (B) : ${counters.scannedRealMissing}`);
  console.log(`  paired (A+B)                  : ${counters.paired}`);
  console.log(`  repaired                      : ${counters.repaired}${DRY_RUN ? " (DRY RUN — 未動資料)" : ""}`);
  console.log(`  needs manual                  : ${counters.needsManual}`);
  console.log(`  authSource candidates (C)     : ${counters.authSourceCandidates}`);
  console.log(`  authSource fixed              : ${counters.authSourceFixed}${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`  errors                        : ${counters.errors}`);
}

main()
  .catch((e) => {
    console.error("[repair-line-merge-orphans] fatal", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
