"use client";

import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerPurchases, loadCourseCustomerIncome } from "@/server/actions/course-customer-history";
import { formatTWDateTime } from "@/lib/date-utils";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";

const statuses: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳發卡", REFUNDED: "已退款", VOIDED: "已作廢" };

export function CourseCustomerPurchases({ customerId }: { customerId: string }) {
  return <><CourseHistoryList customerId={customerId} label="購買、核帳與退款紀錄" empty="此範圍尚無購買紀錄。共卡使用額度請查看方案。" load={loadCourseCustomerPurchases} render={order=><>
      <p className="font-medium">{order.name} · {statuses[order.status] ?? "狀態待確認"}</p>
      <p>{formatTWDateTime(new Date(order.createdAt))} · {order.points} {order.unit === "SESSION" ? "堂" : "點"}</p>
      <p>{order.confirmedAt ? "原實付" : "訂單金額"} NT$ {order.price.toLocaleString()}{order.confirmedAt && ` · 核帳 ${formatTWDateTime(new Date(order.confirmedAt))}`}</p>
      <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">付款與退款明細</summary>
      {order.paymentMethod && <p>付款：{COURSE_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}{order.transferLastFour ? ` · 後四碼 ${order.transferLastFour}` : ""}{order.listPrice != null ? ` · 原價 NT$ ${order.listPrice} · 折抵 NT$ ${order.listPrice-order.price}` : ""}</p>}
      {order.note && <p>交易備註：{order.note}</p>}
      {order.voidReason && <p>作廢原因：{order.voidReason}</p>}
      {order.refunds.map(refund => <p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} 登錄退款 NT$ {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method]??"其他非現金"} · {refund.reason}</p>)}
      </details>
    </>}/>
    <CourseHistoryList customerId={customerId} label="零售與其他消費紀錄" empty="尚無已關聯此顧客的手動收入紀錄。" load={loadCourseCustomerIncome} render={row => <>
      <div className="flex justify-between gap-3"><strong>{row.name}</strong><strong>NT$ {row.amount.toLocaleString()}</strong></div>
      <p>{row.date} · {row.kind} · {row.payment}</p>
      {row.note && row.note !== row.name && <p className="text-earth-500">{row.note}</p>}
    </>} />
  </>;
}
