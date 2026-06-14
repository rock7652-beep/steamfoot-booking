/**
 * 店家訂閱到期 / 暫停 — 唯讀模式提示（#307）。
 *
 * 持續顯示（不可關閉）：到期店家一進後台每頁都看得到，明確知道處於唯讀模式。
 *   - EXPIRED  →「系統使用期限已到期」
 *   - SUSPENDED→「系統已暫停使用」
 * 本元件只提示；實際寫入限制由 server 端 guard 負責（#304/#305/#306）。
 */
export function SubscriptionStatusBanner({
  state,
}: {
  state: "EXPIRED" | "SUSPENDED";
}) {
  const title = state === "EXPIRED" ? "系統使用期限已到期" : "系統已暫停使用";
  const body =
    "目前為唯讀模式，僅供查看，無法新增 / 修改 / 收款。請聯繫總部完成續約後即可恢復操作。";
  const tone =
    state === "SUSPENDED"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-orange-200 bg-orange-50 text-orange-700";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-4 py-2.5 text-[13px] leading-relaxed ${tone}`}
      role="status"
    >
      <span className="font-semibold">⚠ {title}</span>
      <span className="font-normal opacity-90">{body}</span>
    </div>
  );
}
