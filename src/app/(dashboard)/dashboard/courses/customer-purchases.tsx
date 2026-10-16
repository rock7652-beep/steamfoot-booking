"use client";
import {musicPanelRead} from "@/lib/music-panel-transport";

import {useEffect,useId,useState} from "react";
import {isMusicPreviewPage,subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
import {ModalPanel} from "@/components/admin/modal-panel";
import {MusicTuitionDetails,type TuitionOrder} from "./music-tuition-details";
import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerPurchases } from "@/server/actions/course-customer-history";
import { formatTWDateTime } from "@/lib/date-utils";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";

const statuses: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳發卡", REFUNDED: "已退款", VOIDED: "已作廢" };

const readHistory:typeof loadCourseCustomerPurchases=(...args)=>musicPanelRead("purchases",args,()=>loadCourseCustomerPurchases(...args));
export function CourseCustomerPurchases({ customerId, music=false }: { customerId: string; music?:boolean }) {
  const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!isMusicPreviewPage())return;
  return subscribeMusicFinanceChange(kind=>{if(kind==="receipt")setRevision(n=>n+1);});
 },[]);
  if (music) return <div className="[&_table]:min-w-[900px]"><CourseHistoryList revision={revision} columns={["日期", "學費方案", "期數／堂數", "應收", "已收", "欠款", "狀態", "操作"]} customerId={customerId} label="學費收款紀錄" empty="尚無學費收款紀錄" load={readHistory} render={order=><>
    <td className="tabular-nums">{formatTWDateTime(new Date(order.createdAt))}</td>
    <td className="font-medium">{order.name}</td>
    <td className="tabular-nums">{order.musicTermSizes?.length ? `${order.musicTermSizes.length} 期／` : ""}{order.points} {order.unit === "SESSION" ? "堂" : "點"}</td>
    <td className="text-right tabular-nums">{(order.tuition?.due ?? order.price).toLocaleString()}</td>
    <td className="text-right tabular-nums">{order.tuition || order.confirmedAt ? order.price.toLocaleString() : "—"}</td>
    <td className="text-right tabular-nums">{order.tuition && order.status === "CONFIRMED" ? Math.max(0,order.tuition.due-order.price).toLocaleString() : "—"}</td>
    <td>{statuses[order.status] ?? "待確認"}</td>
    <td>{order.tuition ? <MusicTuitionDetails order={order} onUpdated={()=>setRevision(n=>n+1)}/> : <PurchaseDetailsMenu order={order}/>}</td>
  </>}/></div>;
  return <CourseHistoryList revision={revision} columns={["日期／時間", "方案／堂數", "核帳狀態", "交易金額", "明細"]} customerId={customerId} label="購買、核帳與退款紀錄" empty="尚無交易紀錄" load={readHistory} render={order=><>
      <td className="tabular-nums">{formatTWDateTime(new Date(order.createdAt))}</td>
      <td><p className="font-medium">{order.name}</p><p className="text-earth-600">{order.points} {order.unit === "SESSION" ? "堂" : "點"}</p></td>
      <td><span className={`inline-block rounded px-2 py-1 ${order.status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-earth-50"}`}>{statuses[order.status] ?? "狀態待確認"}</span></td>
      <td className="text-right tabular-nums"><p>NT$ {order.price.toLocaleString()}</p><p className="text-earth-600">{order.tuition?"累計實收":order.confirmedAt ? "原實付" : "訂單金額"}</p>{order.tuition&&<p>未收 {(order.tuition.due-order.price).toLocaleString()}</p>}{order.refunds.length > 0 && <p>退款 {order.refunds.reduce((sum, r)=>sum+r.amount,0).toLocaleString()}</p>}</td>
      <td>
      {order.tuition?<MusicTuitionDetails order={order} onUpdated={()=>setRevision(n=>n+1)}/>:<details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">明細</summary>
      {order.confirmedAt && <p>核帳：{formatTWDateTime(new Date(order.confirmedAt))}</p>}
      {order.paymentMethod && <p>付款：{COURSE_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}{order.transferLastFour ? ` · 後四碼 ${order.transferLastFour}` : ""}{order.listPrice != null ? ` · 原價 NT$ ${order.listPrice} · 折抵 NT$ ${order.listPrice-order.price}` : ""}</p>}
      {order.note && <p>交易備註：{order.note}</p>}
      {order.voidReason && <p>作廢原因：{order.voidReason}</p>}
      {order.refunds.map(refund => <p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} 登錄退款 NT$ {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method]??"其他非現金"} · {refund.reason}</p>)}
      </details>}</td>
    </>}/>;
}

function PurchaseDetailsMenu({order}:{order:TuitionOrder}) {
 const [open,setOpen]=useState(false);
 const titleId=useId();
 return <><ExclusiveMenu label={`${order.name} 收款操作`} triggerText="⋯"><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>setOpen(true)}>查看明細</button></ExclusiveMenu>
 <ModalPanel open={open} onClose={()=>setOpen(false)} labelledById={titleId} width={640}>
  <header className="flex items-center justify-between gap-3 border-b px-4 py-2"><h3 id={titleId} className="font-semibold">{order.name}</h3><button type="button" className="min-h-11 px-3" onClick={()=>setOpen(false)}>關閉</button></header>
  <div className="space-y-3 overflow-y-auto p-4 text-sm">
   <p>{statuses[order.status] ?? "待確認"} · 金額 {order.price.toLocaleString()}</p>
   {order.confirmedAt && <p>核帳：{formatTWDateTime(new Date(order.confirmedAt))}</p>}
   {order.paymentMethod && <p>付款：{COURSE_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}{order.transferLastFour ? ` · 後四碼 ${order.transferLastFour}` : ""}</p>}
   {order.listPrice != null && <p>原價 {order.listPrice.toLocaleString()} · 折抵 {(order.listPrice-order.price).toLocaleString()}</p>}
   {order.note && <p>備註：{order.note}</p>}{order.voidReason && <p>作廢原因：{order.voidReason}</p>}
   {order.refunds.map(refund=><p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} · 退款 {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method] ?? "其他非現金"} · {refund.reason}</p>)}
  </div>
 </ModalPanel></>;
}
