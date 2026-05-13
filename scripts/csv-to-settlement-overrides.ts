/**
 * csv-to-settlement-overrides.ts — operator review CSV → JSON overrides
 *
 * 把 operator 在 Excel / Google Sheets 填好的 wallet-review CSV 轉成
 * data/settlement-wallet-overrides.json。只挑出有 operatorDecision 的列。
 *
 * **絕對只讀 + 純檔案 IO**。不連 DB、不會寫入任何資料。
 * （不像其他 scripts/* 連 Prisma — 本 script 完全離線。）
 *
 * 輸入 CSV 必填欄位（順序不限）：
 *   walletId
 *   operatorDecision  (CONFIRM_AS_IS | OVERRIDE_TOTAL | EXCLUDE_FROM_SETTLEMENT)
 *
 * 額外欄位（僅 OVERRIDE_TOTAL 需要）：
 *   suggestedCorrectTotalSessions  → 寫入 overrideTotalSessions
 *   suggestedUnitPrice              → 寫入 overrideUnitPrice
 *
 * 不會寫入 JSON 的欄位：
 *   customerName / reviewNote / 其他所有 wallet 分析欄位
 *
 * Usage:
 *   # 預設輸出到 stdout（建議 pipe 到目標檔）
 *   npx tsx scripts/csv-to-settlement-overrides.ts wallet-review-reviewed.csv \
 *     > data/settlement-wallet-overrides.json
 *
 *   # 顯示處理摘要到 stderr
 *   npx tsx scripts/csv-to-settlement-overrides.ts wallet-review-reviewed.csv \
 *     --out data/settlement-wallet-overrides.json
 *
 * 規格：docs/staff-settlement-phase1-spec.md §3.7
 */

import { readFileSync, writeFileSync } from "node:fs";

const VALID_DECISIONS = [
  "CONFIRM_AS_IS",
  "OVERRIDE_TOTAL",
  "EXCLUDE_FROM_SETTLEMENT",
] as const;
type Decision = (typeof VALID_DECISIONS)[number];

interface OverrideEntry {
  walletId: string;
  decision: Decision;
  overrideTotalSessions?: number;
  overrideUnitPrice?: number;
}

function fail(msg: string): never {
  console.error(`\n🔴 ERROR: ${msg}\n`);
  process.exit(1);
}

// ── Minimal CSV parser（足以處理本系統 CSV: ", "" 跳脫）─────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // skip; \r\n handled by \n branch
      } else {
        cur += c;
      }
    }
  }
  // last row (no trailing newline)
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function readCellTrimmed(
  row: string[],
  headerMap: Map<string, number>,
  key: string,
): string {
  const idx = headerMap.get(key);
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

function parsePositiveInt(s: string, walletId: string, field: string): number {
  if (s === "") {
    fail(`walletId=${walletId} 的 ${field} 為空，但 OVERRIDE_TOTAL 需要此欄位`);
  }
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) {
    fail(`walletId=${walletId} 的 ${field}="${s}" 不是正整數`);
  }
  return n;
}

function parsePositiveNumber(s: string, walletId: string, field: string): number {
  if (s === "") {
    fail(`walletId=${walletId} 的 ${field} 為空，但 OVERRIDE_TOTAL 需要此欄位`);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    fail(`walletId=${walletId} 的 ${field}="${s}" 不是正數`);
  }
  return n;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const positional = args.filter((a, i) => {
    if (a.startsWith("--")) return false;
    if (i > 0 && args[i - 1] === "--out") return false;
    return true;
  });

  if (positional.length === 0) {
    fail("缺少 CSV 路徑。用法：npx tsx scripts/csv-to-settlement-overrides.ts <csv> [--out <json>]");
  }
  if (positional.length > 1) {
    fail(`預期 1 個 CSV 路徑，收到 ${positional.length} 個。`);
  }
  const csvPath = positional[0];

  let text: string;
  try {
    text = readFileSync(csvPath, "utf8");
  } catch (e) {
    fail(`無法讀取 ${csvPath}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const rows = parseCsv(text);
  if (rows.length === 0) fail("CSV 是空的");

  const headerRow = rows[0];
  const headerMap = new Map<string, number>(
    headerRow.map((h, i) => [h.trim(), i]),
  );

  for (const required of ["walletId", "operatorDecision"]) {
    if (!headerMap.has(required)) {
      fail(`CSV header 缺少必填欄位「${required}」。Header: ${headerRow.join(", ")}`);
    }
  }

  const entries: OverrideEntry[] = [];
  const seenWalletIds = new Set<string>();
  let skippedBlank = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // 完全空白列跳過
    if (row.every((c) => c.trim() === "")) continue;

    const walletId = readCellTrimmed(row, headerMap, "walletId");
    const decisionRaw = readCellTrimmed(row, headerMap, "operatorDecision");

    if (decisionRaw === "") {
      // 未填決策的列：skip（容許 operator 只決策部分 wallet）
      skippedBlank++;
      continue;
    }

    if (walletId === "") {
      fail(`row ${r + 1}：operatorDecision="${decisionRaw}" 但 walletId 為空`);
    }
    if (!VALID_DECISIONS.includes(decisionRaw as Decision)) {
      fail(
        `row ${r + 1} (walletId=${walletId})：operatorDecision="${decisionRaw}" 不是合法值。`
          + ` 必須是 ${VALID_DECISIONS.join(" / ")}`,
      );
    }
    const decision = decisionRaw as Decision;

    if (seenWalletIds.has(walletId)) {
      fail(
        `row ${r + 1}：walletId=${walletId} 在 CSV 中重複。每個 wallet 只能有一筆決策。`,
      );
    }
    seenWalletIds.add(walletId);

    if (decision === "OVERRIDE_TOTAL") {
      const totalStr = readCellTrimmed(
        row,
        headerMap,
        "suggestedCorrectTotalSessions",
      );
      const priceStr = readCellTrimmed(row, headerMap, "suggestedUnitPrice");
      const overrideTotalSessions = parsePositiveInt(
        totalStr,
        walletId,
        "suggestedCorrectTotalSessions",
      );
      const overrideUnitPrice = parsePositiveNumber(
        priceStr,
        walletId,
        "suggestedUnitPrice",
      );
      entries.push({
        walletId,
        decision,
        overrideTotalSessions,
        overrideUnitPrice,
      });
    } else {
      // CONFIRM_AS_IS / EXCLUDE_FROM_SETTLEMENT：不寫入 sessions / price
      entries.push({ walletId, decision });
    }
  }

  // 統計
  const byDecision = entries.reduce<Record<Decision, number>>(
    (acc, e) => {
      acc[e.decision] = (acc[e.decision] ?? 0) + 1;
      return acc;
    },
    {
      CONFIRM_AS_IS: 0,
      OVERRIDE_TOTAL: 0,
      EXCLUDE_FROM_SETTLEMENT: 0,
    },
  );

  const output = {
    version: 1 as const,
    _comment:
      "Generated by scripts/csv-to-settlement-overrides.ts. Do NOT include PII (customerName, reviewNote). See docs/staff-settlement-phase1-spec.md §3.7.",
    _updatedAt: new Date().toISOString().slice(0, 10),
    overrides: entries,
  };

  const json = JSON.stringify(output, null, 2) + "\n";

  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.error(
      `✓ 寫入 ${outPath}（${entries.length} 筆，skipped ${skippedBlank} 列空白決策）`,
    );
    console.error(`  CONFIRM_AS_IS: ${byDecision.CONFIRM_AS_IS}`);
    console.error(`  OVERRIDE_TOTAL: ${byDecision.OVERRIDE_TOTAL}`);
    console.error(
      `  EXCLUDE_FROM_SETTLEMENT: ${byDecision.EXCLUDE_FROM_SETTLEMENT}`,
    );
  } else {
    console.error(
      `(處理 ${entries.length} 筆 override，skipped ${skippedBlank} 列空白)`,
    );
    console.error(
      `  CONFIRM_AS_IS: ${byDecision.CONFIRM_AS_IS} / OVERRIDE_TOTAL: ${byDecision.OVERRIDE_TOTAL} / EXCLUDE: ${byDecision.EXCLUDE_FROM_SETTLEMENT}`,
    );
    process.stdout.write(json);
  }
}

main();
