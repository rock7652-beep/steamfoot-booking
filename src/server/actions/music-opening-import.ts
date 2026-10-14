"use server";
import { authorizeMusicSourceImport } from "@/server/services/music-source-import";
export type MusicOpeningUploadResult = { status: "IDLE" | "HOLD" | "IMPORTED" | "RECONCILE"; message: string };
/** Retired action kept for stale clients: no file read or entitlement write. */
export async function uploadVerifiedMusicOpening(_previous: MusicOpeningUploadResult, _form: FormData): Promise<MusicOpeningUploadResult> {
  void _previous; void _form;
  try { await authorizeMusicSourceImport(); }
  catch { return { status: "HOLD", message: "登入、權限或預覽範圍不符，尚未寫入。" }; }
  return { status: "HOLD", message: "舊補登入口已停用，請重新開啟音教雲資料匯入，先預覽再確認。" };
}
