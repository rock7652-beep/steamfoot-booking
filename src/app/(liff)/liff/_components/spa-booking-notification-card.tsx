import type { SpaDemoBookingNotification } from "@/lib/spa-demo-store";

function formatDate(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

export function SpaBookingNotificationCard({ notification }: { notification: SpaDemoBookingNotification }) {
  const statusLabel = notification.deliveryStatus === "SENT"
    ? "已發送"
    : notification.deliveryStatus === "FAILED"
      ? "發送失敗"
      : notification.deliveryStatus === "SKIPPED"
        ? "待測試"
        : "已建立";
  return (
    <section className="rounded-2xl border border-[#dce8d5] bg-[#f5f9f2] p-4" aria-label="最近預約通知">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-primary-700">LINE 通知</p>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-primary-700">{statusLabel}</span>
      </div>
      <h3 className="mt-3 font-semibold text-earth-900">{notification.title}</h3>
      <p className="mt-1 text-sm text-earth-600">{formatDate(notification.date)}・{notification.time}</p>
      <div className="mt-3 space-y-1.5 text-sm text-earth-700">
        {notification.lines.map((line) => <p key={line}>{line}</p>)}
      </div>
      <p className="mt-3 border-t border-[#dce8d5] pt-3 text-sm font-semibold text-earth-900">{notification.summary}</p>
    </section>
  );
}
