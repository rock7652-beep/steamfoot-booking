"use client";
import {useCoursePersonnelText} from "@/components/course-personnel-label";
import {musicBatchLabel,musicPeriodLabel} from "@/lib/music-purchase-periods";
import { useState } from "react";
import type { CourseMemberRecords } from "@/server/queries/course-member-records";
import { musicPurchasedQuantity, musicPurchasedTitle } from "@/lib/music-purchase-display";
import { formatTWDateTime } from "@/lib/date-utils";
const money=(n:number)=>`NT$ ${n.toLocaleString()}`;
const method=(s:string)=>({CASH:"現金",BANK_TRANSFER:"轉帳",CARD:"刷卡",OTHER:"其他"}[s]??"其他");
export function CourseMemberPaymentRecords({records,music,templates,embedded=false}:{records:CourseMemberRecords;music:boolean;templates:Array<{id:string;name:string}>;embedded?:boolean}) {
  const personnelText = useCoursePersonnelText();
 const [subject,setSubject]=useState("");
 const rows=records.filter(r=>!subject||r.templateIds.includes(subject));
 const subjects=templates.filter(t=>records.some(r=>r.templateIds.includes(t.id)));
 const lessons=(rows:CourseMemberRecords[number]["lessons"])=>rows.length?<ul className="cp-member-lessons">{rows.map(l=><li key={l.id}><time>{formatTWDateTime(new Date(l.date))}</time><span>{l.ordinal?`第 ${l.ordinal} 堂 · `:""}{l.name}</span><span>{personnelText(l.status)}{!music&&l.used?` · ${l.used} ${l.unit === "SESSION" ? "堂" : "點"}`:""}</span></li>)}</ul>:<p className="cp-muted">尚無課堂</p>;
 const content=(r:CourseMemberRecords[number])=><>
  <div className="cp-member-money">{r.due!==null&&<span>應收 {money(r.due)}</span>}<span>已收 {money(r.received)}</span>{r.due!==null&&r.status==="CONFIRMED"&&<span>未收 {money(Math.max(0,r.due-r.received))}</span>}{r.status!=="CONFIRMED"&&<span>{r.status==="PENDING"?"待核帳":r.status==="REFUNDED"?"已退款":r.status==="VOIDED"?"已作廢":r.status}</span>}</div>
  {r.receipts.map(receipt=><p className="cp-payment-line" key={receipt.id}><time>{formatTWDateTime(new Date(receipt.date))}</time><span>{method(receipt.method)}</span><strong>{money(receipt.amount)}</strong></p>)}
  {r.refunds.map(refund=><p className="cp-payment-line" key={refund.id}><time>{formatTWDateTime(new Date(refund.date))}</time><span>退款 · {method(refund.method)}</span><strong>−{money(refund.amount)}</strong></p>)}
  {music&&r.periods.length>0?r.periods.map(period=><details className="cp-member-period" key={period.period}><summary>{musicPeriodLabel(period.period,r.periodStart,r.purchaseBatch)} · {period.lessons} 堂 <span>已收 {money(period.received)}{r.status==="CONFIRMED"&&period.outstanding>0?` · 未收 ${money(period.outstanding)}`:""} ⌄</span></summary>{lessons(r.lessons.filter(l=>l.period===period.period))}</details>):null}
  {r.lessonsAvailable?music&&r.periods.length>0?<>{r.lessons.some(l=>l.period===null||!r.periods.some(p=>p.period===l.period))&&<details className="cp-member-period"><summary>其他課堂／期別待確認</summary>{lessons(r.lessons.filter(l=>l.period===null||!r.periods.some(p=>p.period===l.period)))}</details>}</>:<details className="cp-member-period"><summary>上課紀錄{music?" · 期別待確認":""}</summary>{lessons(r.lessons)}</details>:null}
 </>;
 const purchaseLabel=(r:CourseMemberRecords[number])=><><strong>{music?musicPurchasedTitle(r.name,r.termSizes):r.name}{music&&musicPurchasedQuantity(r.termSizes)&&<span className="cp-purchased-quantity">{musicBatchLabel(r.purchaseBatch,r.periodStart,r.termSizes.length)}{r.purchaseBatch?"・":""}{musicPurchasedQuantity(r.termSizes)}</span>}</strong><span>{r.status==="PENDING"?`應繳 ${money(r.due??0)}`:`已收 ${money(r.received)}`}{r.status==="PENDING"?" · 待核帳":r.status==="REFUNDED"?" · 已退款":r.status==="VOIDED"?" · 已作廢":""}</span><span aria-hidden="true">⌄</span></>;
 if(embedded)return <div className="cp-member-records cp-member-records-embedded" aria-label="繳費與課堂">{rows.map(r=>rows.length===1?<div key={r.id}>{content(r)}</div>:<details className="cp-member-purchase" key={r.id}><summary>{music&&r.purchaseBatch&&<strong>{musicBatchLabel(r.purchaseBatch,r.periodStart,r.termSizes.length)}</strong>}<time>{formatTWDateTime(new Date(r.date))}</time><span>{(music?musicPurchasedQuantity(r.termSizes):null)??`${r.points} ${r.unit==="SESSION"?"堂":"點"}`} · {r.status==="PENDING"?"待核帳":`已收 ${money(r.received)}`} ⌄</span></summary>{content(r)}</details>)}</div>;
 return <section className="cp-member-records" aria-label="購課紀錄"><h2>購課紀錄</h2>{subjects.length>1&&<label>教學項目<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">全部教學項目</option>{subjects.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}{rows.map(r=><details className="cp-card cp-pad" key={r.id}><summary className="cp-payment-summary">{purchaseLabel(r)}</summary>{content(r)}{!r.lessonsAvailable&&<p className="cp-muted">課堂請至我的課表查看</p>}</details>)}</section>;
}
