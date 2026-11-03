"use server";
export type MusicOpeningUploadResult = { status: "IDLE" | "HOLD" | "IMPORTED" | "RECONCILE"; message: string };
/** Retired action kept for stale clients: no file read or entitlement write. */
export async function uploadVerifiedMusicOpening(_previous: MusicOpeningUploadResult, _form: FormData): Promise<MusicOpeningUploadResult> {
  void _previous; void _form;
  return { status: "HOLD", message: "音教雲歷史資料銜接已移除，舊補登入口已停用。" };
}
