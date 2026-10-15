"use client";

import { CourseHistoryList } from "./history-list";
import { loadCourseCustomerPurchases } from "@/server/actions/course-customer-history";
import { formatTWDateTime } from "@/lib/date-utils";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";

const statuses: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳發卡", REFUNDED: "已退款", VOIDED: "已作廢" };

export function CourseCustomerPurchases({ customerId }: { customerId: string }) {
  return <CourseHistoryList columns={["日期／時間", "方案／堂數", "核帳狀態", "交易金額", "明細"]} customerId={customerId} label="購買、核帳與退款紀錄" empty="尚無交易紀錄" load={loadCourseCustomerPurchases} render={order=><>
      <td className="tabular-nums">{formatTWDateTime(new Date(order.createdAt))}</td>
      <td><p className="font-medium">{order.name}</p><p className="text-earth-600">{order.points} {order.unit === "SESSION" ? "堂" : "點"}</p></td>
      <td><span className={`inline-block rounded px-2 py-1 ${order.status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-earth-50"}`}>{statuses[order.status] ?? "狀態待確認"}</span></td>
      <td className="text-right tabular-nums"><p>NT$ {order.price.toLocaleString()}</p><p className="text-earth-600">{order.confirmedAt ? "原實付" : "訂單金額"}</p>{order.refunds.length > 0 && <p>退款 {order.refunds.reduce((sum, r)=>sum+r.amount,0).toLocaleString()}</p>}</td>
      <td>
      <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">付款與退款明細</summary>
      {order.confirmedAt && <p>核帳：{formatTWDateTime(new Date(order.confirmedAt))}</p>}
      {order.paymentMethod && <p>付款：{COURSE_PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}{order.transferLastFour ? ` · 後四碼 ${order.transferLastFour}` : ""}{order.listPrice != null ? ` · 原價 NT$ ${order.listPrice} · 折抵 NT$ ${order.listPrice-order.price}` : ""}</p>}
      {order.note && <p>交易備註：{order.note}</p>}
      {order.voidReason && <p>作廢原因：{order.voidReason}</p>}
      {order.refunds.map(refund => <p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} 登錄退款 NT$ {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method]??"其他非現金"} · {refund.reason}</p>)}
      </details></td>
    </>}/>;
}
