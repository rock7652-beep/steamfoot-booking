import type { ApplicableBalance } from "@/lib/applicable-balance";
import { toLocalDateStr } from "@/lib/date-utils";

const unitLabel = { SESSION: "堂", POINT: "點", USE: "次" };
export function ApplicableBalanceSummary({ balance, selectedCardId, details = false }: {
  balance: ApplicableBalance | null | undefined;
  selectedCardId?: string | null;
  details?: boolean;
}) {
  if (!balance) return <span>—</span>;
  if (balance.pending) return <span role="status">額度更新中…</span>;
  if (!balance.cards.length) return <span>無有效適用方案</span>;
  const selected = balance.cards.find(card => card.id === selectedCardId);
  return <div className="min-w-0 space-y-1 break-words text-sm text-earth-800">
    {balance.groups.map(group => <strong className="block" key={group.unit}>剩餘 {group.available} {unitLabel[group.unit]}</strong>)}
    {details && selected && <span className="block">本次方案剩 {selected.remaining} {unitLabel[selected.unit]}</span>}
    {details && <details className="text-left">
      <summary className="min-h-11 cursor-pointer py-2 text-primary-800">方案明細（{balance.cards.length}）</summary>
      <ul className="space-y-2">
        {balance.cards.map(card => <li className="break-words" key={card.id}>
          <p>{card.id === selectedCardId && "本次使用・"}{card.name}{card.shared && "・共用額度"}</p>
          <p>剩餘 {card.remaining}・預約保留 {card.held}・可用 {card.available} {unitLabel[card.unit]}</p>
          <p>{card.expiryLabel ?? (card.expiresAt ? `期限 ${toLocalDateStr(new Date(card.expiresAt))}` : "來源已核對：無期限")}</p>
        </li>)}
      </ul>
    </details>}
  </div>;
}
