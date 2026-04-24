import Link from "next/link";

/**
 * 無方案 empty state — 顧客端使用
 *
 * 場景：顧客尚未購買課程 / 堂數為 0 / self-booking 未開通
 * 規則：
 *   - 不誤導進入預約流程
 *   - 不跳回首頁
 *   - 提供「聯繫店長」(官方 LINE) 與「查看課程方案」兩個明確出口
 *
 * variant:
 *   - "booking" (預設)：新增預約 / 預約第一堂 入口
 *   - "plan"：我的方案頁
 */
interface Props {
  title?: string;
  variant?: "booking" | "plan";
  /** Store-aware shop link，例：`/s/zhubei/book/shop`。Fallback 為 `/book/shop`。 */
  shopHref?: string;
}

const OFFICIAL_LINE_URL = "https://lin.ee/8ohprFv";

export function NoPlanEmptyState({ title, variant = "booking", shopHref = "/book/shop" }: Props) {
  const isPlan = variant === "plan";
  const headline = isPlan ? "目前尚未購買方案" : "目前尚未開通課程方案";
  const description = isPlan
    ? "開通後可：線上預約、查看剩餘堂數、查看使用紀錄"
    : "請先聯繫店長協助儲值或開通後，再進行預約";
  const secondaryLabel = isPlan ? "購買課程方案" : "查看課程方案";

  return (
    <div>
      {title && (
        <div className="mb-5 flex items-center gap-3">
          <Link href="/book" className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">
            &larr;
          </Link>
          <h1 className="text-2xl font-bold text-earth-900">{title}</h1>
        </div>
      )}

      <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
            <path d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6z" />
            <path d="M21 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6" />
          </svg>
        </div>
        <p className="text-xl font-bold text-earth-900">{headline}</p>
        <p className="mt-3 text-base leading-relaxed text-earth-800 whitespace-pre-line">
          {description}
        </p>

        <div className="mt-6 space-y-3">
          <a
            href={OFFICIAL_LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#06C755] text-base font-semibold text-white shadow-sm transition hover:bg-[#05b54d] active:scale-[0.98]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            聯繫店長（LINE）
          </a>
          <Link
            href={shopHref}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl border border-earth-300 bg-white text-base font-semibold text-earth-800 hover:bg-earth-50"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
