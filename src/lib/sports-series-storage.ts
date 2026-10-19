import "server-only";
import { AppError } from "./errors";
import { Prisma } from "../../generated/course-client";
import { sportsProductionEnabled } from "../../scripts/sports-production-scope.mjs";
/** Identifiers are constants; a store ID can never become a SQL identifier. */
export function sportsSeriesTable(storeId: string) {
  return Prisma.raw(sportsProductionEnabled(storeId)
    ? 'public."SportsScheduleSeries"'
    : 'public."SportsPreviewScheduleSeries"');
}

/** Containment without hiding persisted rules, balances or makeup rights. */
export function assertSportsPermanentCreationAllowed(storeId: string) {
  if (sportsProductionEnabled(storeId) && process.env.SPORTS_PERMANENT_CREATION_PAUSED === "1") {
    throw new AppError("FORBIDDEN", "固定課暫停新增；既有課程、出席及補課仍保留。");
  }
}
