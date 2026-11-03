import { normalizeLineOfficialUrl } from "@/lib/line-official-url";

export function BookingLineEntry({ href, verified = false, friendHref }: { href?: string; verified?: boolean; friendHref?: string }) {
  if (!href && !verified) return null;
  if (verified) return <section aria-label="LINE 身分驗證" className="flex items-center gap-2 py-1 text-base font-medium text-primary-800">
    <span aria-hidden="true">✓</span><span>LINE 身分已驗證</span>
  </section>;
  const friendUrl = normalizeLineOfficialUrl(friendHref);
  return <section aria-label="LINE 身分驗證" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary-100 bg-primary-50 p-3 text-earth-800">
    {href && <a href={href} data-line-booking-entry className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#06C755] px-4 py-2 text-base font-semibold text-white">使用 LINE 驗證並預約</a>}
    {friendUrl && <a href={friendUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary-700 underline">加入本店官方 LINE</a>}
  </section>;
}
