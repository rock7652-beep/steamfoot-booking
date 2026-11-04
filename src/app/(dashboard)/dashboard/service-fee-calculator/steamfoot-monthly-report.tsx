"use client";
import type {ReactNode} from 'react';
import {useAdjustmentReportLines} from '@/components/operations/monthly-adjustment-context';
import {MonthlyDetailList} from '@/components/operations/monthly-detail-list';
import type {SettlementLine} from '@/lib/course-monthly-settlement';
const money=(n:number)=>`NT$ ${n.toLocaleString('zh-TW',{maximumFractionDigits:2})}`;
export function SteamfootMonthlyReport({lines:originalLines,people,tools,canEdit}:{lines:SettlementLine[];people:{id:string;name:string}[];tools:ReactNode;canEdit:boolean}){
 const lines=useAdjustmentReportLines(originalLines);
 const base=lines.filter(l=>l.kind!=='ADJUSTMENT').reduce((n,l)=>n+(l.amount??0),0),addition=lines.filter(l=>l.kind==='ADJUSTMENT').reduce((n,l)=>n+Math.max(0,l.amount??0),0),deduction=lines.filter(l=>l.kind==='ADJUSTMENT').reduce((n,l)=>n+Math.max(0,-(l.amount??0)),0),unknown=lines.some(l=>l.amount===null||l.issue);
 return <section className="min-w-0 space-y-2" aria-label="蒸足月結明細"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span>服務收入 <strong>{unknown?'待核對':money(base)}</strong></span><span>增項 <strong>+{money(addition)}</strong></span><span>減項 <strong>−{money(deduction)}</strong></span><span>總計 <strong className="text-primary-800">{unknown?'待核對':money(base+addition-deduction)}</strong></span></div>{tools}</div><MonthlyDetailList basePeople={people} lines={lines} feeLabel="服務收入" canEditAdjustments={canEdit}/><p className="text-sm text-earth-500">租金依原約定分列，不自動從收入扣除。負數差額不自動帶入下個月。</p></section>;
}
