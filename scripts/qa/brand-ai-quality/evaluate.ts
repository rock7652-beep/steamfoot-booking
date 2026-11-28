// Default offline: no key, network, database or LINE. Real mode needs separate approval.
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { brandKnowledge } from "../../../src/server/services/brand-ai-knowledge";
import type { BrandAiDiagnostics } from "../../../src/server/services/brand-ai-diagnostics";
import { selectBrandAiAnswer } from "../../../src/server/services/brand-ai-provider";
import {
  emptyBrandProfile,
  type BrandProfile,
} from "../../../src/server/services/brand-ai-dialogue";
import { toLocalDateStr } from "../../../src/lib/date-utils";
async function main() {
  const file = resolve(dirname(process.argv[1]), "cases.json");
  const cases = JSON.parse(readFileSync(file, "utf8")) as {
    id: string;
    channel: "phone" | "api";
    question: string;
    sourcesAny: string[];
    prior?: BrandProfile;
    focus: string[];
  }[];
  const fingerprint = createHash("sha256")
    .update(readFileSync(file))
    .digest("hex");
  const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes("--real")) {
    for (const row of cases) {
      const sourceIds = brandKnowledge(
        row.question + JSON.stringify(row.prior ?? emptyBrandProfile),
      ).sources.map((s) => s.id);
      if (
        row.sourcesAny.length &&
        !row.sourcesAny.some((id) => sourceIds.includes(id))
      )
        throw Error("RETRIEVAL_MISSING");
    }
    console.log(
      JSON.stringify({
        mode: "offline-retrieval-only",
        cases: cases.length,
        passed: true,
        realCalls: 0,
        modelQuality: "NOT_EVALUATED",
      }),
    );
  } else {
    // Does not use or pull Production credentials. Only synthetic/public corpus.
    const max = Number(arg("--authorized-calls")),
      external = Number(arg("--daily-used"));
    if (
      !process.argv.includes("--authorized-calls") ||
      !Number.isInteger(max) ||
      max < 1 ||
      max > 70 ||
      !process.argv.includes("--daily-used") ||
      !Number.isInteger(external) ||
      external < 0 ||
      external > 20 ||
      !process.argv.includes("--ledger") ||
      !process.env.OPENAI_API_KEY ||
      process.env.BRAND_AI_ENABLED === "1"
    )
      throw Error("EXPLICIT_EVALUATION_BUDGET_AND_AI_OFF_REQUIRED");
    if (
      process.env.BRAND_AI_MODEL &&
      process.env.BRAND_AI_MODEL !== "gpt-6-luna"
    )
      throw Error("EVALUATION_MODEL_RATE_NOT_APPROVED");
    const path = resolve(arg("--ledger"));
    const repo = resolve(dirname(process.argv[1]), "..", "..", "..");
    if (path.startsWith(repo + sep))
      throw Error("PRIVATE_REPORT_MUST_BE_OUTSIDE_REPO");
    const lock = openSync(path + ".lock", "wx", 0o600);
    type Ledger = {
      fingerprint: string;
      max: number;
      baselines: Record<string, number>;
      calls: { id: string; attempt: number; day: string }[];
      results: {
        id: string;
        route: string;
        attempts: number;
        codes: string[];
        diagnostics: BrandAiDiagnostics;
        answer: string;
        inputTokens: number | null;
        outputTokens: number | null;
        sourceIds: string[];
        humanReview: "PENDING";
        styleFlags: string[];
      }[];
    };
    try {
      let ledger: Ledger;
      try {
        ledger = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw Error("LEDGER_INVALID");
        ledger = { fingerprint, max, baselines: {}, calls: [], results: [] };
      }
      if (ledger.fingerprint !== fingerprint || ledger.max !== max)
        throw Error("LEDGER_MISMATCH_NO_RESET");
      const today = toLocalDateStr();
      ledger.baselines[today] = Math.max(
        ledger.baselines[today] ?? 0,
        external,
      );
      const save = () => {
        writeFileSync(path, JSON.stringify(ledger, null, 2), { mode: 0o600 });
        chmodSync(path, 0o600);
      };
      save();
      for (const row of cases.filter(
        (item) =>
          item.channel === "api" &&
          !ledger.results.some((r) => r.id === item.id),
      )) {
        const result = await selectBrandAiAnswer(
          row.question,
          {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            BRAND_AI_MODEL: process.env.BRAND_AI_MODEL,
            BRAND_AI_VERSION: "2",
          },
          fetch,
          async (attempt = 1) => {
            const day = toLocalDateStr();
            if (
              day !== today ||
              ledger.calls.length >= max ||
              ledger.calls.filter((c) => c.day === day).length +
                ledger.baselines[day] >=
                20
            )
              return false;
            ledger.calls.push({ id: row.id, attempt, day });
            save(); // reserve before I/O, never refund
            return true;
          },
          row.prior ?? emptyBrandProfile,
        );
        if (!result.diagnostics?.attempts) break; // resume unstarted case later, no budget reset
        ledger.results.push({
          id: row.id,
          route: result.diagnostics.route,
          attempts: result.diagnostics.attempts,
          codes: result.diagnostics.failures.map((d) => d.code),
          diagnostics: result.diagnostics,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          sourceIds: result.knowledgeIds ?? [],
          answer: result.text,
          humanReview: "PENDING",
          styleFlags: [
            ...(result.text.length > 150 ? ["LONG_REVIEW_REQUIRED"] : []),
            ...((result.text.match(/[？?]/g) ?? []).length > 1
              ? ["MULTIPLE_QUESTIONS"]
              : []),
          ],
        });
        save();
      }
      console.log(
        JSON.stringify({
          mode: "real-private-report",
          callsReserved: ledger.calls.length,
          completed: ledger.results.length,
          humanQuality: "PENDING",
          lineSends: 0,
        }),
      );
    } finally {
      closeSync(lock);
      unlinkSync(path + ".lock");
    }
  }
}
main().catch(() => {
  console.error("QUALITY_EVALUATION_FAILED_NO_PRIVATE_DETAILS");
  process.exitCode = 1;
});
