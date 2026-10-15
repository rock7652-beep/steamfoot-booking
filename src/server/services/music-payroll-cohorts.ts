import "server-only";
import type { SettlementLine } from "@/lib/course-monthly-settlement";
import { assertMusicOpeningPreviewEnvironment } from "../../../scripts/music-opening-preview-scope.mjs";

/** Exact session IDs audited on 2026-10-15; never infer payroll provenance from a name or prefix. */
export const LEGACY_PAYROLL_SESSION_IDS = new Set([
  "qa-music-opening-ui-20261007-session", "music-accept-self-organized-20261001",
  "music-accept-v1-moved-3-0", "qa-music-states-20261007-private-session",
  "qa-music-states-20261007-group-session", "qa0928-group-1",
  "music-accept-v1-weekly-1-1", "music-luby-group15-preview-session-1",
  "music-accept-v1-weekly-2-1", "music-accept-v1-weekly-3-1",
  "qa-opening-makeup-lifecycle-20261008-session", "cmv4xeb6d0000l906lnydrf6s",
  "cmv4xfpkx0000l2060cnnfc6v", "qa0928-group-2", "music-accept-v1-weekly-1-2",
  "music-accept-v1-biweekly-1-1", "music-luby-group15-preview-session-2",
  "music-accept-v1-weekly-2-2", "music-accept-v1-biweekly-2-1",
  "music-accept-v1-weekly-3-2", "music-accept-v1-biweekly-3-1",
]);
export function separateMusicPayroll(storeId: string, lines: SettlementLine[], env: Record<string, string | undefined> = process.env) {
  let separationEnabled = false;
  if (storeId === "store-lubymusic" && env.VERCEL === "1") {
    try { assertMusicOpeningPreviewEnvironment(env); separationEnabled = true; } catch { /* Outside this isolated Preview, preserve existing payroll. */ }
  }
  const isLegacy = (line: SettlementLine) => separationEnabled && line.kind === "FEE" && LEGACY_PAYROLL_SESSION_IDS.has(line.id);
  return { separationEnabled, lines: lines.filter(line => !isLegacy(line)), legacyTestLines: lines.filter(isLegacy) };
}
