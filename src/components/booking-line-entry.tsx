import { normalizeLineOfficialUrl } from "@/lib/line-official-url";

export function BookingLineEntry({ href, verified = false, friendHref }: { href?: string; verified?: boolean; friendHref?: string }) {
  if (!href && !verified) return null;
  const friendUrl = normalizeLineOfficialUrl(friendHref);
  return <section aria-label="LINE 身分驗證" className="mb-5 rounded-2xl border border-primary-100 bg-primary-50 p-4 text-earth-800 sm:p-5">
    <p className="text-base font-semibold">{verified ? "LINE 身分已驗證" : "先驗證 LINE，預約時連結通知"}</p>
    <p className="mt-2 text-sm leading-6">{verified
      ? "完成預約後會顯示本店的連結結果，不必再到聊天輸入電話。"
      : "電話在表單填一次。完成驗證後，可在預約時連結本店通知。"}</p>
    {!verified && href && <a href={href} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#06C755] px-4 py-2 text-base font-semibold text-white">使用 LINE 驗證並預約</a>}
    {!verified && friendUrl && <p className="mt-2 text-sm leading-6">尚未加入好友？<a href={friendUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary-700 underline">加入本店官方 LINE</a></p>}
  </section>;
}
