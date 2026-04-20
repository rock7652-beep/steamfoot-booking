/**
 * Desktop Primitive — InfoList
 *
 * 桌機 detail page 的 label / value 清單，用於 SideCard 或 section 內部展示基本資料。
 * 取代 `<dl>` + tailwind 重複碼。
 *
 * 規格（對齊 design/04-phase2-plan.md 一般 detail page 實作經驗）：
 *   label 11px earth-500
 *   value 13px earth-800（可自訂 ReactNode）
 *   兩欄（label 左 / value 右），值可跨多行
 *   items 空值（null/undefined）顯示 —，完整 dash 不要隱藏行，保留對齊感
 *
 * 使用時機：
 *   - 顧客基本資料 / 系統資訊
 *   - 右側 action rail 的系統資訊小卡
 *   - 任何需要「標籤 + 值」清單且不想做表格的場景
 */

export interface InfoListItem {
  label: string;
  value: React.ReactNode;
  /** 跨整列顯示（適合長文字備註） */
  full?: boolean;
}

interface Props {
  items: InfoListItem[];
  /** 每列內部欄位密度：`compact` 行距更小，適合右側小卡 */
  density?: "normal" | "compact";
  /** 整體為兩欄 grid（左右各一組 label+value）；預設為單欄 */
  columns?: 1 | 2;
}

export function InfoList({ items, density = "normal", columns = 1 }: Props) {
  const rowPadding = density === "compact" ? "py-1" : "py-1.5";
  const gridClass =
    columns === 2
      ? "grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2"
      : "flex flex-col";

  return (
    <dl className={gridClass}>
      {items.map((it, i) => (
        <div
          key={`${it.label}-${i}`}
          className={`${rowPadding} flex items-start justify-between gap-4 ${
            it.full && columns === 2 ? "sm:col-span-2" : ""
          }`}
        >
          <dt className="shrink-0 text-[11px] text-earth-500">{it.label}</dt>
          <dd className="text-right text-[13px] text-earth-800">
            {it.value == null || it.value === "" ? (
              <span className="text-earth-400">—</span>
            ) : (
              it.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
