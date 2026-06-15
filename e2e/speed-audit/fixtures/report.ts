/**
 * Speed Audit v1 — 文字報告 reporter
 *
 * 收集各步驟 attach 的 speed-metric，於測試結束輸出：
 *   - 分組（A 預約 / B 顧客）表格
 *   - pass / warn / fail / skip 統計
 *   - 固定附「Preview ≠ prod」警語 + 指向 prod log 對照（docs/speed-audit.md §對照）
 *
 * 同時寫一份純文字檔到 e2e/speed-audit/.report/（已 gitignore）。
 * v1 為報告制：reporter 不改變 playwright 退出碼成敗，只負責呈現。
 */

import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { StepMetric, StepVerdict } from "./metrics";

const SYMBOL: Record<StepVerdict, string> = {
  pass: "✅ pass",
  warn: "⚠️  warn",
  fail: "❌ fail",
  skip: "➖ skip",
};

function pad(s: string, width: number): string {
  // 以「顯示寬度」粗估：CJK 字元算 2 格
  let w = 0;
  for (const ch of s) w += /[　-鿿＀-￯]/.test(ch) ? 2 : 1;
  return s + " ".repeat(Math.max(0, width - w));
}

export default class SpeedAuditReporter implements Reporter {
  private metrics: StepMetric[] = [];

  onTestEnd(_test: TestCase, result: TestResult): void {
    for (const att of result.attachments) {
      if (att.name === "speed-metric" && att.body) {
        try {
          this.metrics.push(JSON.parse(att.body.toString("utf-8")) as StepMetric);
        } catch {
          /* 忽略單筆解析失敗 */
        }
      }
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    const text = this.render();
    process.stdout.write("\n" + text + "\n");
    try {
      const dir = join(process.cwd(), "e2e", "speed-audit", ".report");
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(join(dir, `speed-audit-${stamp}.txt`), text, "utf-8");
    } catch {
      /* 寫檔失敗不阻斷 */
    }
  }

  private render(): string {
    const baseURL = process.env.SPEED_AUDIT_BASE_URL ?? "(未設定)";
    const now = new Date().toISOString();
    const lines: string[] = [];

    lines.push("═".repeat(72));
    lines.push(" Speed Audit v1 — 店長核心流程速度巡檢");
    lines.push(` 時間: ${now}`);
    lines.push(` baseURL: ${baseURL}`);
    lines.push("═".repeat(72));

    if (this.metrics.length === 0) {
      lines.push("");
      lines.push(" （無任何步驟 metric — 可能登入失敗或測試未執行）");
      lines.push("═".repeat(72));
      return lines.join("\n");
    }

    const suites = [...new Set(this.metrics.map((m) => m.suite))];
    for (const suite of suites) {
      lines.push("");
      lines.push(suite);
      lines.push(
        "  " +
          pad("step", 34) +
          pad("reaction", 12) +
          pad("rsc", 6) +
          pad("err", 6) +
          "verdict",
      );
      for (const m of this.metrics.filter((x) => x.suite === suite)) {
        const reaction = m.firstReactionMs == null ? "—" : `${m.firstReactionMs}ms`;
        lines.push(
          "  " +
            pad(m.step, 34) +
            pad(reaction, 12) +
            pad(String(m.rscCount), 6) +
            pad(String(m.consoleErrors), 6) +
            SYMBOL[m.verdict],
        );
        if (m.detail) lines.push("      ↳ " + m.detail + (m.note ? `（${m.note}）` : ""));
      }
    }

    const counts = { pass: 0, warn: 0, fail: 0, skip: 0 } as Record<StepVerdict, number>;
    for (const m of this.metrics) counts[m.verdict]++;

    lines.push("");
    lines.push("─".repeat(72));
    lines.push(
      ` 總結: ${this.metrics.length} steps | ${counts.pass} pass | ${counts.warn} warn | ${counts.fail} fail | ${counts.skip} skip`,
    );

    const warns = this.metrics.filter((m) => m.verdict === "warn");
    const fails = this.metrics.filter((m) => m.verdict === "fail");
    for (const m of [...fails, ...warns]) {
      lines.push(`   ${SYMBOL[m.verdict]}  ${m.suite} / ${m.step} — ${m.detail}`);
    }

    lines.push("");
    lines.push(" ⚠️ 提醒：本報告為 Preview / Staging 量測。正式站受 connection_limit=1");
    lines.push("    + Supabase pooler 影響，相同步驟可能更慢。請對照 Vercel production");
    lines.push("    log 的 [PERF] / [PERF:SLA_BREACH]（見 docs/speed-audit.md）。");
    lines.push("═".repeat(72));

    return lines.join("\n");
  }
}
