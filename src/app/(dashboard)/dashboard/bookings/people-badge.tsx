/**
 * PR-3c：多人預約的醒目人數標示。
 *
 * 取代原本灰色淡淡的「×N」（容易被店長誤判成 1 人）。amber pill 與
 * FIRST_TRIAL「未收款」badge 同調色，視覺上一致代表「需要店長注意」。
 *
 * 只有 `people > 1` 才應該呼叫此元件。
 */

interface Props {
  people: number;
  /** 緊湊版本（day-detail-panel 每列用），預設較大（drawer header 用）。 */
  size?: "compact" | "default";
  className?: string;
}

export function PeopleBadge({ people, size = "default", className = "" }: Props) {
  const cls =
    size === "compact"
      ? "inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
      : "ml-2 inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-bold text-amber-900";
  return (
    <span
      className={`${cls} ${className}`}
      aria-label={`${people} 人`}
    >
      {people} 人
    </span>
  );
}
