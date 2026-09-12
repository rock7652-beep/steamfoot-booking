import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";
import { SPA_PAYMENT_LABELS } from "@/lib/spa-payment-methods";
import { spaPartyLabel, spaReceiptStatus } from "@/lib/spa-booking-display";

export function SpaBookingSummary({
  booking,
  date,
  customer,
  staff,
  location,
}: {
  booking: SpaScheduleBooking;
  date: string;
  customer: string;
  staff: string;
  location: string;
}) {
  const receipt = booking.receipt;
  return (
    <section aria-label="預約摘要" className="space-y-5 text-earth-800">
      <div className="rounded-xl border border-earth-200 bg-earth-50 p-4">
        <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {customer}
          {spaPartyLabel(booking) && (
            <span className="rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-700">
              {spaPartyLabel(booking)}
            </span>
          )}
        </p>
        <h3 className="mt-3 font-semibold">{booking.serviceName}</h3>
        <p className="mt-2">
          {date} · {booking.startTime}–{booking.endTime}
        </p>
        <p className="mt-2 text-sm">
          {staff} · {location}
        </p>
        <p className="mt-3 font-semibold">
          預約金額 NT${booking.totalPrice.toLocaleString("zh-TW")}
        </p>
      </div>
      {receipt && (
        <>
          <div
            role="status"
            className="rounded-xl border border-primary-100 bg-primary-50 p-4 font-semibold text-primary-800"
          >
            {spaReceiptStatus(receipt)}
          </div>
          <details className="rounded-xl border border-earth-200 p-4">
            <summary className="min-h-11 cursor-pointer font-medium">
              帳務明細
            </summary>
            <div className="space-y-3 text-sm">
              <p>
                原付款：
                {SPA_PAYMENT_LABELS[receipt.paymentMethod] ??
                  receipt.paymentMethod}{" "}
                ·{" "}
                {receipt.paymentMethod === "ENTITLEMENT"
                  ? `${receipt.uses ?? 0} 次`
                  : `NT$${receipt.amount.toLocaleString("zh-TW")}`}
              </p>
              {receipt.balanceAfter != null && (
                <p>
                  結帳當時
                  {receipt.paymentMethod === "ENTITLEMENT"
                    ? `方案剩餘 ${receipt.balanceAfter} 次（含已保留）`
                    : `儲值餘額 NT$${receipt.balanceAfter.toLocaleString("zh-TW")}`}
                  <span className="block text-earth-500">
                    此為歷史紀錄；目前餘額請至顧客帳務查看。
                  </span>
                </p>
              )}
              {receipt.transferLast4 && (
                <p>轉帳後四碼：{receipt.transferLast4}</p>
              )}
              <p>
                結帳時間：
                {new Intl.DateTimeFormat("zh-TW", {
                  timeZone: "Asia/Taipei",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(receipt.paidAt))}
              </p>
              <p className="break-all text-xs text-earth-500">
                結帳編號：{receipt.id}
              </p>
            </div>
          </details>
        </>
      )}
      {booking.notes && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">預約備註</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {booking.notes}
          </p>
        </div>
      )}
    </section>
  );
}
