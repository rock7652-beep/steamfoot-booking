"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorizeMusicOpeningImport, importVerifiedMusicOpening } from "@/server/services/music-opening-import";
import { AppError } from "@/lib/errors";

const envelope = z.object({ data: z.unknown(), proof: z.object({
  sourceManifestKey: z.string().min(1).max(200), sourceRevision: z.string().min(1).max(200),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), now: z.string().datetime({ offset: true }),
  maxAgeMs: z.number().int().min(1).max(86_400_000),
}).strict() }).strict();

export type MusicOpeningUploadResult = { status: "IDLE" | "HOLD" | "IMPORTED" | "RECONCILE"; message: string };

/** Only an already verified manifest may be submitted. Never manufacture proof
 * from the uploaded content, expose raw source data, or retry uncertain commits. */
export async function uploadVerifiedMusicOpening(_previous: MusicOpeningUploadResult, form: FormData): Promise<MusicOpeningUploadResult> {
  let importStarted = false;
  try {
    await authorizeMusicOpeningImport(); // Before reading untrusted file contents.
    const file = form.get("manifest");
    if (!file || typeof file === "string" || file.size === 0 || file.size > 512_000) {
      return { status: "HOLD", message: "請選擇有效的核實資料檔（上限 500 KB）。" };
    }
    let input: z.infer<typeof envelope>;
    try { input = envelope.parse(JSON.parse(await file.text())); }
    catch { return { status: "HOLD", message: "資料格式不完整，尚未寫入。" }; }
    // This form is exclusively for Luby. Nullable schema support is not
    // evidence that this institution offers unlimited validity.
    const expiryCheck = z.object({ enrollments: z.array(z.object({ record: z.object({
      expiryVerification: z.object({ kind: z.string() }).optional(),
    }).passthrough() }).passthrough()).optional(), makeup: z.object({ records: z.array(z.object({
      expiry: z.object({ value: z.string().nullable() }).passthrough(),
    }).passthrough()) }).passthrough().optional() }).passthrough().safeParse(input.data);
    if (expiryCheck.success && (expiryCheck.data.enrollments?.some(item => item.record.expiryVerification?.kind === "NO_EXPIRY") || expiryCheck.data.makeup?.records.some(item => item.expiry.value === null))) {
      return { status: "HOLD", message: "陸比方案都有期限，請核實繳費記錄的有效期限；尚未寫入。" };
    }
    importStarted = true;
    const result = await importVerifiedMusicOpening(input.data, input.proof);
    if (result.status !== "IMPORTED") return { status: "HOLD", message: "來源資料、日期、期限或對應尚待核實，尚未寫入。" };
    // Counts only: no card IDs, student IDs, manifest contents or audit payload.
    const message = `讀回完成：新增方案 ${result.created} 筆、補課權益 ${result.makeup.created} 筆；已存在方案 ${result.skipped} 筆、補課權益 ${result.makeup.skipped} 筆。`;
    for (const path of ["/dashboard/courses", "/dashboard/courses/opening-makeups"]) revalidatePath(path);
    return { status: "IMPORTED", message };
  } catch (error) {
    if (!importStarted) return { status: "HOLD", message: "目前登入、權限、預覽範圍或作業時段不符，尚未寫入。" };
    if (error instanceof AppError) return { status: "HOLD", message: "交易檢查未通過，請核對來源及目前資料；勿直接重送。" };
    return { status: "RECONCILE", message: "未取得完整交易結果，必須先依來源鍵讀回核對；勿重送或視為零筆。" };
  }
}
