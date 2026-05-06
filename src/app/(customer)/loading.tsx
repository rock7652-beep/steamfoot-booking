/**
 * Customer route-group loading fallback.
 *
 * 接住沒有自帶 loading.tsx 的子路由（my-bookings/[id]、book/shop、my-growth、
 * my-points、my-referrals 等）切換時的空白瞬間。
 *
 * 顧客大多是 40+ 中高齡使用者：
 *   - 字級不縮（沿用 17px 主體）
 *   - 卡片留白偏寬
 *   - skeleton 形狀刻意模糊，避免使用者誤以為是真實內容
 *
 * Layout 已被 (customer)/layout.tsx 渲染（含 sidebar / mobile nav），
 * 這份 skeleton 只負責 main content 區。
 */
export default function CustomerLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* 標題卡 */}
      <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="h-6 w-44 rounded bg-earth-200" />
        <div className="mt-3 h-4 w-56 rounded bg-earth-100" />
        <div className="mt-2 h-4 w-32 rounded bg-earth-100" />
      </section>

      {/* 內容卡 ×3 */}
      {Array.from({ length: 3 }).map((_, i) => (
        <section
          key={i}
          className="rounded-[20px] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-earth-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-earth-200" />
              <div className="h-3 w-48 rounded bg-earth-100" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
