"use client";
import { useActionState } from "react";
import { uploadVerifiedMusicOpening, type MusicOpeningUploadResult } from "@/server/actions/music-opening-import";

const initial: MusicOpeningUploadResult = { status: "IDLE", message: "尚未提交資料。" };
export function OpeningImportForm() {
  const [state, action, pending] = useActionState(uploadVerifiedMusicOpening, initial);
  return <form action={action} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-white p-5">
    <p role="status" aria-live="polite" className="break-words text-base">{state.message}</p>
    <label htmlFor="opening-manifest" className="text-base font-medium">已核實資料檔</label>
    <input id="opening-manifest" name="manifest" type="file" accept="application/json,.json" required disabled={pending || state.status === "RECONCILE"} className="w-full min-w-0 rounded border p-3 text-base" />
    <p className="text-base text-gray-600">每批均核對既有資料並讀回結果。未核實的日期、期限及來源對應不會建立可扣堂權益。</p>
    <button type="submit" disabled={pending || state.status === "RECONCILE"} className="min-h-11 self-start rounded-lg bg-blue-600 px-5 py-3 text-base text-white disabled:opacity-50">{pending ? "核對及補登中…" : "核對並補登"}</button>
  </form>;
}
