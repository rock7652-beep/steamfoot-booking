"use client";
import {formatTWDateTime} from "@/lib/date-utils";
import type {CourseCardView} from "./member-workspace";
export function CourseCardEntries({ card,sessionUnitLabel="堂",entryLabels={} }: {entryLabels?:Record<string,string>;sessionUnitLabel?:string; card: CourseCardView }) {
  const labels: Record<string, string> = {
    GRANT: "取得額度",
    REFUND: "退款收回額度",
    VOID: "註銷／作廢收回額度",
    RESERVE: "預約保留額度",
    RELEASE: "取消預約返還額度",
    DEBIT: "出席使用",
    MANUAL_BACKFILL: sessionUnitLabel==='次'?"補登已服務扣除":"補登已上課扣除",
    MANUAL_VOID: sessionUnitLabel==='次'?"註銷次數":"註銷堂數",
    MANUAL_REVERSE: "更正返還",
    ...entryLabels,
  };
  return (
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">最近額度紀錄（{card.entries.length} 筆）</summary>
      <ul className="divide-y text-sm">
        {card.entries.map((e) => (
          <li key={e.id} className="py-2">
            {formatTWDateTime(new Date(e.createdAt))} ·{" "}
            {e.kind.startsWith("CORRECT:") ? "點名更正" : labels[e.kind.split(":")[0]] ?? "額度異動"} {e.points} {card.unit === "SESSION" ? sessionUnitLabel : "點"}
            {card.sessionAdjustments?.filter(r=>r.id===e.id).map(r=><div key={r.id} className="mt-1 space-y-1 text-earth-600">{card.sessionAdjustments?.some(c=>c.reversalOf===r.id)&&<p>原調整已更正返還</p>}{r.occurredOn&&<p>實際上課日期：{r.occurredOn}</p>}<p>操作人員：{r.actorName} · 原因：{r.reason||'未填寫'}</p></div>)}
          </li>
        ))}
      </ul>
    </details>
  );
}
