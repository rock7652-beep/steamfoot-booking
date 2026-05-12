/**
 * settlement-overrides — 讀取 data/settlement-wallet-overrides.json
 *
 * Operator 透過 scripts/plan-amortization-wallet-review.ts 產出 CSV，人工
 * 填好 operatorDecision 後跑 scripts/csv-to-settlement-overrides.ts 轉成
 * 這份 JSON。本服務在 server 啟動時載入，給 `previewStaffSettlement` 用
 * 來決定每筆 booking 的金額來源。
 *
 * 規則對應 docs/staff-settlement-phase1-spec.md §3.7。
 *
 * **不寫入任何資料**。只讀 JSON。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const SETTLEMENT_DECISIONS = [
  "CONFIRM_AS_IS",
  "OVERRIDE_TOTAL",
  "EXCLUDE_FROM_SETTLEMENT",
] as const;

export type SettlementDecision = (typeof SETTLEMENT_DECISIONS)[number];

export const OverrideEntrySchema = z
  .object({
    walletId: z.string().min(1),
    decision: z.enum(SETTLEMENT_DECISIONS),
    overrideTotalSessions: z.number().int().positive().optional(),
    overrideUnitPrice: z.number().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "OVERRIDE_TOTAL") {
      if (v.overrideTotalSessions === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `decision=OVERRIDE_TOTAL 需要 overrideTotalSessions（walletId=${v.walletId}）`,
          path: ["overrideTotalSessions"],
        });
      }
      if (v.overrideUnitPrice === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `decision=OVERRIDE_TOTAL 需要 overrideUnitPrice（walletId=${v.walletId}）`,
          path: ["overrideUnitPrice"],
        });
      }
    }
  });

export const OverrideFileSchema = z.object({
  version: z.literal(1),
  overrides: z.array(OverrideEntrySchema),
});

export type SettlementOverride = z.infer<typeof OverrideEntrySchema>;

// ── 載入並驗證 JSON 一次 ──────────────────────────────────────────────
// 用 fs.readFileSync 而非 import — 避免 Next.js bundler / tsconfig path
// 配置敏感性。檔案在 server cold start 讀一次，後續 in-memory cache。

const OVERRIDES_PATH = join(
  process.cwd(),
  "data",
  "settlement-wallet-overrides.json",
);

let overrideMapCache: Map<string, SettlementOverride> | null = null;

function loadOverrides(): Map<string, SettlementOverride> {
  if (overrideMapCache) return overrideMapCache;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  } catch (e) {
    // 檔案不存在或 JSON 壞掉 — fail loud（這是 spec 違規）
    throw new Error(
      `[settlement-overrides] 無法讀取或解析 ${OVERRIDES_PATH}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  let parsed: z.infer<typeof OverrideFileSchema>;
  try {
    parsed = OverrideFileSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.issues
        .map((i) => `  [${i.path.join(".")}] ${i.message}`)
        .join("\n");
      throw new Error(
        `[settlement-overrides] ${OVERRIDES_PATH} schema 驗證失敗:\n${msg}`,
      );
    }
    throw e;
  }

  const map = new Map<string, SettlementOverride>();
  for (const o of parsed.overrides) {
    if (map.has(o.walletId)) {
      throw new Error(
        `[settlement-overrides] 重複的 walletId: ${o.walletId}（JSON 內每個 wallet 只能有一筆 override）`,
      );
    }
    map.set(o.walletId, o);
  }

  overrideMapCache = map;
  return map;
}

/**
 * 給定 wallet id，回傳 operator 設定的 override；無則 null。
 *
 * 在 server query / action 內使用。回傳 null 代表「沒被 operator review 過」，
 * 由呼叫端決定 fallback 行為（通常是：若該 wallet 有 ADJUSTMENT 紀錄則
 * needsReview，否則用公式）。
 */
export function getOverrideForWallet(
  walletId: string,
): SettlementOverride | null {
  return loadOverrides().get(walletId) ?? null;
}

/**
 * Test-only：重設 cache（讓單元測試可以替換 JSON 內容）。
 * Production code 不應呼叫此函式。
 */
export function _resetOverrideCacheForTesting(): void {
  overrideMapCache = null;
}

/**
 * 列出所有 overrides — 供管理 / debug 頁面。
 */
export function listAllOverrides(): SettlementOverride[] {
  return [...loadOverrides().values()];
}
