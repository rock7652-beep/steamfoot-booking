import { AnalysisDetailLink } from "./analysis-detail-link";

export type FocusRow = { label: string; current?: number; difference?: number | null; unit: string; href?: string };
export function FocusTable({ rows, currentDates, previousDates }: { rows: FocusRow[]; currentDates: string; previousDates: string }) {
  const value = (n: number | undefined, unit: string) => n === undefined ? "—" : unit === "元" ? `NT$ ${n.toLocaleString()}` : unit === "%" ? `${n.toFixed(1)}%` : `${n.toLocaleString()} ${unit}`;
  return <div className="rounded-lg border border-earth-200 bg-white">
    <table className="w-full table-fixed text-sm tabular-nums" aria-label="經營重點比較">
      <thead className="border-b border-earth-200 bg-earth-50 text-xs text-earth-600"><tr>
        <th className="w-[28%] px-3 py-2 text-left font-medium">重點指標</th>
        <th className="px-2 py-2 text-right font-medium">所選期間<span className="mt-0.5 block text-[11px]">{currentDates}</span></th>
        <th className="px-2 py-2 text-right font-medium">比較期間<span className="mt-0.5 block text-[11px]">{previousDates}</span></th>
        <th className="w-[20%] px-3 py-2 text-right font-medium">增減</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className="border-b border-earth-100 last:border-0">
        <th scope="row" className="px-3 py-2 text-left font-medium text-earth-800">{row.label}</th>
        <td className="px-2 py-2 text-right font-semibold text-primary-800">{row.href && row.current !== undefined ? <AnalysisDetailLink href={row.href} title={row.label} className="inline-flex min-h-9 items-center underline decoration-primary-200 underline-offset-4">{value(row.current, row.unit)}</AnalysisDetailLink> : <span className="inline-flex min-h-9 items-center">{value(row.current, row.unit)}</span>}</td>
        <td className="px-2 py-2 text-right text-earth-600">{value(row.current !== undefined && row.difference != null ? row.current - row.difference : undefined, row.unit)}</td>
        <td className="px-3 py-2 text-right text-earth-700">{row.difference == null ? "—" : row.difference === 0 ? "持平" : `${row.difference > 0 ? "+" : "−"}${Math.abs(row.difference).toLocaleString(undefined, { maximumFractionDigits: row.unit === "%" ? 1 : 0 })} ${row.unit === "%" ? "百分點" : row.unit}`}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
