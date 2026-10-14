"use server";
import { z } from "zod";
import { authorizeMusicSourceImport, previewMusicSourceImport, commitMusicSourceImport, readMusicSourceBatch } from "@/server/services/music-source-import";
import { AppError } from "@/lib/errors";
import type { MusicSourcePreview } from "@/lib/music-source-import";
import { sourceBatchId } from "@/lib/music-source-import";
export type MusicSourceImportState = {
  status: "IDLE" | "PREVIEW" | "HOLD" | "IMPORTED" | "RECONCILE";
  message: string; fileVersion?: number; preview?: MusicSourcePreview; contentHash?: string; planHash?: string; batchId?: string;
};
export async function submitMusicSourceImport(_previous: MusicSourceImportState, form: FormData): Promise<MusicSourceImportState> {
  let started = false, recoveryBatchId: string | undefined;
  try {
    await authorizeMusicSourceImport();
    const file = form.get("manifest");
    if (!file || typeof file === "string" || file.size === 0 || file.size > 512_000) return { status: "HOLD", message: "請選擇 JSON 備份檔，每批最多 100 位學生、500 KB。" };
    const raw: unknown = JSON.parse(await file.text());
    const fileVersion = z.coerce.number().int().min(0).parse(form.get("fileVersion"));
    const checked = await previewMusicSourceImport(raw);
    recoveryBatchId = sourceBatchId(checked.contentHash);
    if (form.get("intent") !== "commit") return { status: "PREVIEW", message: "預覽完成，尚未寫入。請核對學生與歷史紀錄。", fileVersion, ...checked };
    if (form.get("confirmed") !== "yes" || form.get("contentHash") !== checked.contentHash || form.get("planHash") !== checked.planHash) return { status: "HOLD", message: "資料或預覽已變動，請重新預覽並確認。" };
    started = true;
    const result = await commitMusicSourceImport(raw, checked.planHash);
    return { status: "IMPORTED", batchId: result.batchId, fileVersion, message: result.duplicate ? "同一份來源已匯入，已讀回批次，不重複新增。" : `已封存 ${checked.preview.counts.students} 位學生的來源資料；新增 ${checked.preview.create} 位學生，${checked.preview.review} 位待核對。歷史紀錄可下載核對。` };
  } catch (error) {
    if (started && !(error instanceof AppError)) return { status: "RECONCILE", batchId: recoveryBatchId, message: "尚未取得完整結果。請保留這份檔案，用下方按鈕讀回同一批次；不要更改來源後另建批次。" };
    if (error instanceof AppError && error.message === "BUSINESS_HOURS_IMPORT_PAUSED") return { status: "HOLD", message: "營業時段可預覽；寫入請在營業時間外執行。" };
    if (error instanceof AppError && error.code === "CONFLICT") return { status: "HOLD", message: "資料已變動或讀回未通過，交易已中止。請重新預覽。" };
    return { status: "HOLD", message: "資料格式、權限或隔離環境檢查未通過，尚未確認匯入。" };
  }
}
export async function exportMusicSourceBatch(batchId: string) {
  try { return { success: true as const, data: await readMusicSourceBatch(batchId) }; }
  catch { return { success: false as const, message: "批次讀回失敗，請保留來源檔並核對權限。" }; }
}
