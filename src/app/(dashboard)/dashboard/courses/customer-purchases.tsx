"use client";

import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerPurchases } from "@/server/actions/course-customer-history";
import { formatTWDateTime } from "@/lib/date-utils";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";

const statuses: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳發卡", REFUNDED: "已退款", VOIDED: "已作廢" };

export function CourseCustomerPurchases({ customerId, compact=false }: { customerId: string;compact?:boolean }) {
  return <CourseHistoryList compact={compact} customerId={customerId} label="購買、核帳與退款紀錄" empty="尚無交易紀錄" load={loadCourseCustomerPurchases} render={order=>compact?<details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-1">
        <span className="shrink-0 text-earth-500">{formatTWDateTime(new Date(order.createdAt))}</span>
        <span className="min-w-0 flex-1 font-medium">{order.name}</span>
        <span className="tabular-nums">NT$ {order.price.toLocaleString()}</span>
        <span>{statuses[order.status]??"待確認"}{order.refunds.length>0?` · 退款 NT$ ${order.refunds.reduce((sum,r)=>sum+r.amount,0).toLocaleString()}`:""}</span><span aria-hidden="true">⌄</span>
      </summary><div className="space-y-1 border-t border-earth-100 py-2 text-earth-600">
        <p>{order.points} {order.unit==="SESSION"?"堂":"點"} · {COURSE_PAYMENT_LABELS[order.paymentMethod??""]??"付款方式未記錄"}{order.transferLastFour?` · 後四碼 ${order.transferLastFour}`:""}{order.confirmedAt?` · 核帳 ${formatTWDateTime(new Date(order.confirmedAt))}`:""}</p>
        {order.listPrice!=null&&<p>原價 NT$ {order.listPrice.toLocaleString()} · 折抵 NT$ {(order.listPrice-order.price).toLocaleString()}</p>}
        {order.note&&<p>{order.note}</p>}{order.voidReason&&<p>作廢：{order.voidReason}</p>}
        {order.refunds.map(refund=><p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} · 退款 NT$ {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method]??"其他非現金"} · {refund.reason}</p>)}
      </div></details>:<>
      <p className="font-medium">{order.name} · {statuses[order.status] ?? "狀態待確認"}</p>
      <p>{formatTWDateTime(new Date(order.createdAt))} · {order.points} {order.unit === "SESSION" ? "堂" : "點"}</p>
      <p>{order.confirmedAt ? "原實付" : "訂單金額"} NT$ {order.price.toLocaleString()}{order.confirmedAt && ` · 核帳 ${formatTWDateTime(new Date(order.confirmedAt))}`}</p>
      <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">付款與退款明細</summary>
      {order.paymentMethod && <p>付款：{COURSE_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}{order.transferLastFour ? ` · 後四碼 ${order.transferLastFour}` : ""}{order.listPrice != null ? ` · 原價 NT$ ${order.listPrice} · 折抵 NT$ ${order.listPrice-order.price}` : ""}</p>}
      {order.note && <p>交易備註：{order.note}</p>}
      {order.voidReason && <p>作廢原因：{order.voidReason}</p>}
      {order.refunds.map(refund => <p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} 登錄退款 NT$ {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method]??"其他非現金"} · {refund.reason}</p>)}
      </details>
    </>}/>;
}
