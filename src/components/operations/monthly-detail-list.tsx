"use client";
import {useState,type ReactNode} from 'react';
import {formatTWDateTime} from '@/lib/date-utils';
import {summarizeSettlement,type SettlementLine} from '@/lib/course-monthly-settlement';
import {RosterTable} from '@/components/admin/roster-table';
import {MonthlyAdjustmentRowActions} from "./monthly-adjustment-row-actions";
import {RightSheet} from '@/components/admin/right-sheet';
const money=(n:number)=>`NT$ ${n.toLocaleString('zh-TW')}`;
const identity=(line:SettlementLine)=>`${line.kind}:${line.id}`;
/** Read-only presentation of the same authoritative fee/adjustment/payment lines. */
export function MonthlyDetailList({lines,feeLabel,actions,canEditAdjustments=false}:{lines:SettlementLine[];feeLabel:string;actions?:ReactNode;canEditAdjustments?:boolean}){
 const [query,setQuery]=useState(''),[selectedKey,setSelected]=useState<string|null>(null);
 const visible=lines.filter(line=>line.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const people=summarizeSettlement(visible);
 const ordered=[...visible].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()||a.name.localeCompare(b.name,'zh-Hant')||identity(a).localeCompare(identity(b)));
 const selected=lines.find(line=>identity(line)===selectedKey);
 return <section className="min-w-0 space-y-2" aria-label="月結彙總與逐筆明細">
  <div className="flex flex-wrap items-center gap-2"><input type="search" aria-label="搜尋月結人員" placeholder="搜尋人員" value={query} onChange={e=>setQuery(e.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm sm:max-w-xs"/>{actions&&<div className="ml-auto flex flex-wrap gap-2">{actions}</div>}</div>
  <div className="[&_th:not(:first-child)]:text-right"><RosterTable label="人員月結彙總" dense minWidth={880} columns={['人員',feeLabel,'增項','減項','總計']}>
   {people.map(person=>{const unresolved=person.issues>0||person.lines.some(line=>line.amount===null),total=person.fee+person.profit+person.adjustment;return <tr key={person.id} data-monthly-person={person.id}><td className="font-medium">{person.name}</td><td className="text-right tabular-nums">{person.lines.some(l=>l.kind!=='ADJUSTMENT'&&(l.issue||l.amount===null))?'待核對':money(person.fee+person.profit)}</td><td className="text-right tabular-nums">+{money(person.addition)}</td><td className="text-right tabular-nums">−{money(person.deduction)}</td><td className="text-right font-semibold tabular-nums">{unresolved?'待核對':money(total)}</td></tr>;})}
   {!people.length&&<tr data-list-divider><td colSpan={5} className="text-earth-500">{query?'找不到符合的人員。':'本月沒有結算紀錄。'}</td></tr>}
  </RosterTable></div>
  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><h3 className="font-semibold">逐筆明細</h3><span className="text-earth-500">{ordered.length} 筆 · 依日期排列</span></div>
  <div role="region" aria-label="月結逐筆明細" tabIndex={0} className="max-h-[60vh] max-w-full overflow-auto rounded-lg border border-earth-200 focus-visible:outline-2 focus-visible:outline-primary-600">
   <table data-striped-list className="w-full min-w-[1040px] text-left text-sm"><thead className="sticky top-0 z-20 bg-earth-50 text-earth-600"><tr>{['日期／時間','人員','明細',feeLabel,'增項','減項','總計'].map((title,i)=><th key={i} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${i>2?'text-right':''}`}>{title}</th>)}</tr></thead><tbody className="divide-y divide-earth-100">
    {ordered.map(line=>{const adjustment=line.kind==='ADJUSTMENT',amount=line.amount;return <tr key={identity(line)} data-monthly-line={identity(line)}><td className="whitespace-nowrap px-3 py-0 tabular-nums">{formatTWDateTime(new Date(line.date)).slice(5,adjustment?10:16)}</td><td className="whitespace-nowrap px-3 py-0">{line.name}</td><td className="max-w-80 px-3 py-0"><div className="flex min-w-0 items-center gap-1"><button type="button" aria-label={`${line.name} ${line.label} 完整明細`} className="flex min-h-11 w-full min-w-44 items-center text-left text-primary-800 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600" onClick={()=>setSelected(identity(line))}><span className="line-clamp-1">{line.label}</span></button>{adjustment&&canEditAdjustments&&<MonthlyAdjustmentRowActions id={line.id} name={line.name}/>}</div></td><td className="whitespace-nowrap px-3 py-0 text-right tabular-nums">{adjustment?'—':amount===null?'待核對':money(amount)}</td><td className="whitespace-nowrap px-3 py-0 text-right tabular-nums">{adjustment&&amount!==null&&amount>=0?`+${money(amount)}`:'—'}</td><td className="whitespace-nowrap px-3 py-0 text-right tabular-nums">{adjustment&&amount!==null&&amount<0?`−${money(-amount)}`:'—'}</td><td className="whitespace-nowrap px-3 py-0 text-right font-medium tabular-nums">{amount===null||line.issue?'待核對':money(amount)}</td></tr>;})}
    {!ordered.length&&<tr data-list-divider><td colSpan={7} className="p-3 text-earth-500">沒有符合的明細。</td></tr>}
   </tbody></table>
  </div>
  {selected&&<RightSheet open presentation="centered" width={640} maxHeight={640} labelledById="monthly-line-title" onClose={()=>setSelected(null)}><header className="flex items-center justify-between gap-2 border-b border-earth-200 px-4 py-2"><h3 id="monthly-line-title" className="font-semibold">{selected.name} · 完整明細</h3><button type="button" className="min-h-11 min-w-11 rounded px-3" onClick={()=>setSelected(null)}>關閉</button></header><div className="min-h-0 space-y-3 overflow-auto p-4 text-sm"><p className="break-words font-medium">{selected.label}</p><p>{formatTWDateTime(new Date(selected.date))}{selected.endsAt&&` ～ ${formatTWDateTime(new Date(selected.endsAt))}`}</p><p>{selected.kind==='ADJUSTMENT'?(selected.amount??0)>=0?'增項':'減項':feeLabel}：{selected.amount===null?'待核對':money(selected.amount)}</p>{selected.feeDetails?.map((detail,i)=><p key={i}>{detail.name} · {detail.reason} · {detail.base===null?'待核對':money(detail.base)} → {detail.amount===null?'待核對':money(detail.amount)}</p>)}{selected.issue&&<p role="alert" className="text-amber-800">{selected.issue}</p>}</div></RightSheet>}
 </section>;
}
