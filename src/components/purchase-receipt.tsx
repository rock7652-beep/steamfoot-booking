import { CopyButton } from "@/app/(customer)/book/shop/[planId]/checkout/copy-button";

type Props = { receipt: { id: string; transactionNo: string | null; planNameSnapshot: string | null; amount: number; transferLastFour: string | null; paymentStatus: string; customer: { name: string } }; contactUrl?: string | null };
export function PurchaseReceipt({ receipt, contactUrl }: Props) {
  const status = receipt.paymentStatus === "PENDING" ? "待店家確認" : receipt.paymentStatus === "CONFIRMED" || receipt.paymentStatus === "SUCCESS" ? "已確認付款" : "已取消或未完成";
  const message = [`購買申請：${receipt.planNameSnapshot ?? "方案"}`, `姓名：${receipt.customer.name}`, `金額：NT$${receipt.amount.toLocaleString("zh-TW")}`, `轉出帳號後四碼：${receipt.transferLastFour ?? "未提供"}`, `訂單編號：${receipt.transactionNo ?? receipt.id}`, `狀態：${status}`, "麻煩協助核對，謝謝。"].join("\n");
  return <section className="rounded-xl border border-earth-200 bg-white p-4 text-left shadow-sm">
    <h2 className="font-semibold text-earth-900">訂單摘要 · {status}</h2>
    <p className="mt-2 text-sm text-earth-600">付款資料已儲存，店家可在待確認收款查看。LINE 通知依店家設定發送；如需補充，可複製下方資料貼給店長。</p>
    <pre className="my-4 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-earth-800">{message}</pre>
    <div className="flex flex-wrap items-center gap-4"><CopyButton value={message} label="複製付款資訊" />{contactUrl && <a href={contactUrl} className="text-sm font-medium text-primary-700">開啟本店 LINE</a>}</div>
  </section>;
}
