/**
 * LIFF 我的方案 — pure helpers (PR-E2)
 *
 * 不放在 `src/server/actions/liff-my-wallets.ts`（"use server" 檔）的原因：
 *   Next.js / Turbopack 要求 `"use server"` 檔的所有 value export 必須是 async
 *   server action。non-async helper export 在 dev tsc + vitest 不會抓，但
 *   `next build` 會直接 fail（PR-D2 #175 build 修正時 captured 的教訓）。
 *
 *   修法：純函數放本檔，action 檔 import 即可。
 */

/**
 * 純函數：wallet list → active / expired / history 三段分類。
 *
 * 分類規則 (per PR-E2 拍板 B (b) — LIFF defensive 視角)：
 *   history  = status ∈ {USED_UP, CANCELLED}  OR  (status=ACTIVE AND availableToBook=0)
 *               ↑ ACTIVE+0 視同已用完 — 避免 race window 期間顧客看到「有方案卻不能用」
 *   expired  = status = EXPIRED  OR  (status=ACTIVE AND expiryDate < nowMs)
 *               ↑ 防 race — 無 cron 自動轉 EXPIRED，本檔前端 defensive date check
 *   active   = 其餘（status=ACTIVE AND availableToBook>0 AND expiryDate >= now or null）
 *
 * 不改 DB status — 只是 LIFF read-only 顯示分類。
 *
 * 抽出純函數的理由：
 *   - vitest 可注入 nowMs 不依賴系統時鐘
 *   - 與 splitLiffBookings (PR-D2) 同 pattern
 */
export function splitLiffWallets<
  T extends {
    status: string;
    availableToBook: number;
    expiryDate: string | null;
  },
>(wallets: T[], nowMs: number = Date.now()): {
  active: T[];
  expired: T[];
  history: T[];
} {
  const active: T[] = [];
  const expired: T[] = [];
  const history: T[] = [];

  for (const w of wallets) {
    // 終態 — 直接 history
    if (w.status === "USED_UP" || w.status === "CANCELLED") {
      history.push(w);
      continue;
    }
    // 顯式 EXPIRED — 直接 expired
    if (w.status === "EXPIRED") {
      expired.push(w);
      continue;
    }
    // ACTIVE — 三個 sub-case
    if (w.status === "ACTIVE") {
      // Defensive：日期過了但 status 還沒翻 → 視同 expired
      if (w.expiryDate && expiryDateMs(w.expiryDate) < nowMs) {
        expired.push(w);
        continue;
      }
      // Defensive：堂數用完但 status 還沒翻 → 視同 used up
      if (w.availableToBook <= 0) {
        history.push(w);
        continue;
      }
      active.push(w);
      continue;
    }
    // 防禦：unknown status → history（不誤呈現為可用）
    history.push(w);
  }

  return { active, expired, history };
}

/**
 * 「YYYY-MM-DD」→ Taipei 當日 23:59:59 的毫秒值。
 *
 * 用 23:59:59 而非 00:00:00：方案 expiryDate 是「當日仍可使用」的語意（顧客視角），
 * 不是「當日凌晨即失效」。e.g. expiryDate=2026-05-24 表示 5/24 一整天還能用。
 *
 * 用 +08:00 而非 UTC：方案到期判斷以 Taipei 為準（顧客所在時區）。
 */
function expiryDateMs(yyyymmdd: string): number {
  return new Date(`${yyyymmdd}T23:59:59+08:00`).getTime();
}

/**
 * 純函數：判斷 wallet 是否「即將到期」（7 天內，per PR-E2 拍板）。
 *
 * - expiryDate = null（無期限）→ false（永遠不催）
 * - expiryDate 已過 → false（已分到 expired section，不需 badge）
 * - 0 < 剩餘天數 ≤ 7 → true
 */
export function isExpiringSoon(
  expiryDate: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!expiryDate) return false;
  const expiryMs = new Date(`${expiryDate}T23:59:59+08:00`).getTime();
  const diffMs = expiryMs - nowMs;
  if (diffMs <= 0) return false; // 已過期 — 不顯示「即將到期」badge
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}
