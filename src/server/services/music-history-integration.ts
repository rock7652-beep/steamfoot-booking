import "server-only";
import { AppError } from "@/lib/errors";
import { MUSIC_HISTORY_INTEGRATION_ENABLED } from "@/lib/music-history-integration";

export function requireMusicHistoryIntegration() {
  if (!MUSIC_HISTORY_INTEGRATION_ENABLED) {
    throw new AppError("FORBIDDEN", "音教雲歷史資料銜接已移除");
  }
}
