"use client";

import { FormEvent, useMemo, useState } from "react";
import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import { ModulePreviewSwitcher } from "./module-preview-switcher";

type BookingStatus = "新客體驗" | "已確認" | "待到店" | "已到店" | "服務中" | "已完成";
type Tone = "sage" | "sand" | "rose" | "slate";

type PreviewProvider = {
  id: string;
  badge: string;
  name: string;
  specialties: string;
};

type PreviewBooking = {
  id: string;
  date: string;
  time: string;
  customer: string;
  service: string;
  providerId: string;
  durationMinutes: number;
  status: BookingStatus;
  tone: Tone;
  remainingSessions: number | null;
  note: string;
};

type QuickSlot = {
  date: string;
  time: string;
  providerId: string;
};

const previewProviders: readonly PreviewProvider[] = [
  { id: "p08", badge: "08", name: "陳語安", specialties: "精油芳療・肩頸舒壓" },
  { id: "p12", badge: "12", name: "張若琳", specialties: "深層芳療・全身按摩" },
  { id: "p16", badge: "16", name: "王心瑜", specialties: "臉部保養・新客體驗" },
];

const scheduleDays = [
  { key: "2026-08-28", shortLabel: "8/28", weekday: "五", today: false },
  { key: "2026-08-29", shortLabel: "8/29", weekday: "六", today: true },
  { key: "2026-08-30", shortLabel: "8/30", weekday: "日", today: false },
] as const;

const scheduleTimes = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30"] as const;

const initialBookings: readonly PreviewBooking[] = [
  {
    id: "booking-lin",
    date: "2026-08-29",
    time: "10:00",
    customer: "林小姐",
    service: "新客舒壓體驗 60 分鐘",
    providerId: "p08",
    durationMinutes: 60,
    status: "新客體驗",
    tone: "rose",
    remainingSessions: null,
    note: "首次到店，肩頸容易緊繃",
  },
  {
    id: "booking-zhang",
    date: "2026-08-29",
    time: "11:30",
    customer: "張小姐",
    service: "深層芳療 10 次",
    providerId: "p12",
    durationMinutes: 90,
    status: "待到店",
    tone: "sand",
    remainingSessions: 6,
    note: "偏好力道中等，避開左肩舊傷",
  },
  {
    id: "booking-zhou",
    date: "2026-08-29",
    time: "11:30",
    customer: "周小姐",
    service: "全身芳療單次 90 分鐘",
    providerId: "p16",
    durationMinutes: 90,
    status: "已確認",
    tone: "sage",
    remainingSessions: null,
    note: "單次服務，現場付款",
  },
  {
    id: "booking-wang",
    date: "2026-08-29",
    time: "14:30",
    customer: "王小姐",
    service: "全身芳療單次 90 分鐘",
    providerId: "p08",
    durationMinutes: 90,
    status: "已確認",
    tone: "sage",
    remainingSessions: null,
    note: "希望加強腰背",
  },
  {
    id: "booking-li",
    date: "2026-08-29",
    time: "14:30",
    customer: "李小姐",
    service: "舒壓療程 5 次",
    providerId: "p12",
    durationMinutes: 90,
    status: "待到店",
    tone: "sand",
    remainingSessions: 3,
    note: "療程將於 9/30 到期",
  },
  {
    id: "booking-xu",
    date: "2026-08-29",
    time: "16:00",
    customer: "許小姐",
    service: "年度保養 12 次",
    providerId: "p16",
    durationMinutes: 90,
    status: "已確認",
    tone: "sage",
    remainingSessions: 8,
    note: "固定每兩週保養",
  },
  {
    id: "booking-before",
    date: "2026-08-28",
    time: "13:00",
    customer: "吳小姐",
    service: "舒壓療程 3 次",
    providerId: "p08",
    durationMinutes: 90,
    status: "已完成",
    tone: "slate",
    remainingSessions: 1,
    note: "已完成服務",
  },
];

const blockedSlots: Readonly<Record<string, string>> = {
  "2026-08-29:13:00:p08": "午休",
  "2026-08-29:13:00:p12": "午休",
  "2026-08-29:13:00:p16": "午休",
  "2026-08-29:16:00:p08": "緩衝",
  "2026-08-29:17:30:p12": "提早下班",
  "2026-08-30:10:00:p16": "休假",
};

const managerNavigation = [
  { label: "今日營運", detail: "總覽", active: true },
  { label: "預約管理", detail: "6 筆", active: false },
  { label: "顧客管理", detail: "128 位", active: false },
  { label: "療程管理", detail: "6 項", active: false },
  { label: "芳療師管理", detail: "3 位", active: false },
  { label: "營運設定", detail: "", active: false },
] as const;

const toneClasses: Record<Tone, string> = {
  sage: "border-[#cbd6c4] bg-[#edf2e9] text-[#4b6241]",
  sand: "border-[#e4d5bb] bg-[#f6f0e5] text-[#765f38]",
  rose: "border-[#e3c7be] bg-[#f7ece8] text-[#855649]",
  slate: "border-earth-200 bg-earth-100 text-earth-500",
};

export function SpaManagerSchedulePreview() {
  const industryModule = SPA_INDUSTRY_MODULE;
  const [bookings, setBookings] = useState<PreviewBooking[]>(() => [...initialBookings]);
  const [dayIndex, setDayIndex] = useState(1);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>("booking-lin");
  const [quickSlot, setQuickSlot] = useState<QuickSlot | null>(null);
  const [notice, setNotice] = useState("點選預約可查看詳情，點選空白時段可快速新增。");

  const selectedDay = scheduleDays[dayIndex];
  const dayBookings = useMemo(
    () => bookings.filter((booking) => booking.date === selectedDay.key),
    [bookings, selectedDay.key],
  );
  const selectedBooking = bookings.find((booking) => booking.id === selectedBookingId) ?? null;
  const activeCount = dayBookings.filter((booking) => booking.status !== "已完成").length;
  const newCustomerCount = dayBookings.filter((booking) => booking.status === "新客體驗").length;

  function chooseDay(nextIndex: number) {
    const safeIndex = Math.max(0, Math.min(scheduleDays.length - 1, nextIndex));
    const nextDay = scheduleDays[safeIndex];
    const firstBooking = bookings.find((booking) => booking.date === nextDay.key);
    setDayIndex(safeIndex);
    setSelectedBookingId(firstBooking?.id ?? null);
    setQuickSlot(null);
    setNotice(`${nextDay.shortLabel}（${nextDay.weekday}）排程已顯示。`);
  }

  function openBooking(bookingId: string) {
    setSelectedBookingId(bookingId);
    setQuickSlot(null);
    setNotice("已開啟預約詳情。");
  }

  function openQuickBooking(slot: QuickSlot) {
    setQuickSlot(slot);
    setSelectedBookingId(null);
    const provider = getProvider(slot.providerId);
    setNotice(`正在安排 ${slot.time}・${provider.badge}號 ${provider.name}。`);
  }

  function updateBookingStatus(status: BookingStatus) {
    if (!selectedBookingId) return;
    setBookings((current) => current.map((booking) => {
      if (booking.id !== selectedBookingId) return booking;
      const remainingSessions = status === "已完成" && booking.remainingSessions !== null
        ? Math.max(booking.remainingSessions - 1, 0)
        : booking.remainingSessions;
      return { ...booking, status, remainingSessions, tone: status === "已完成" ? "slate" : booking.tone };
    }));
    setNotice(status === "已完成" ? "服務已完成，療程次數已於示範資料中扣除 1 次。" : `預約狀態已更新為「${status}」。`);
  }

  function requestRebooking() {
    if (!selectedBooking) return;
    const provider = getProvider(selectedBooking.providerId);
    setNotice(`已準備為 ${selectedBooking.customer} 安排下一次；保留 ${provider.badge}號 ${provider.name}，日期與時間重新選擇。`);
  }

  function createQuickBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickSlot) return;
    const formData = new FormData(event.currentTarget);
    const customer = String(formData.get("customer") ?? "").trim();
    const serviceKey = String(formData.get("service") ?? "trial");
    const service = industryModule.services.find((candidate) => candidate.key === serviceKey) ?? industryModule.services[0];
    if (!customer || !service) return;

    const booking: PreviewBooking = {
      id: `preview-${Date.now()}`,
      date: quickSlot.date,
      time: quickSlot.time,
      customer,
      service: service.name,
      providerId: quickSlot.providerId,
      durationMinutes: service.durationMinutes,
      status: service.category === "TRIAL" ? "新客體驗" : "已確認",
      tone: service.category === "TRIAL" ? "rose" : "sage",
      remainingSessions: service.category === "PACKAGE" ? service.sessions : null,
      note: "由店長於現場／電話快速建立",
    };
    setBookings((current) => [...current, booking]);
    setSelectedBookingId(booking.id);
    setQuickSlot(null);
    setNotice(`${customer} 的預約已加入示範排程。重新整理後會復原，不會寫入正式資料。`);
  }

  function openFirstAvailableSlot() {
    for (const time of scheduleTimes) {
      for (const provider of previewProviders) {
        const occupied = dayBookings.some((booking) => booking.time === time && booking.providerId === provider.id);
        const blocked = blockedSlots[slotKey(selectedDay.key, time, provider.id)];
        if (!occupied && !blocked) {
          openQuickBooking({ date: selectedDay.key, time, providerId: provider.id });
          return;
        }
      }
    }
    setNotice("這一天目前沒有可快速安排的時段。");
  }

  return (
    <div className="min-h-screen bg-[#f5f3ee] text-earth-900">
      <div className="mx-auto min-h-screen max-w-[1600px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-earth-200/80 bg-[#2f352b] px-5 py-7 text-white lg:flex lg:flex-col">
          <div className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary-200">蒸管家</p>
            <p className="mt-2 text-lg font-semibold">沐光舒療 SPA</p>
            <p className="mt-1 text-xs text-white/55">店長管理後台・示範店</p>
          </div>

          <nav className="mt-6 space-y-1.5" aria-label="店長後台功能">
            {managerNavigation.map((item) => (
              <div
                key={item.label}
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-between rounded-xl px-3.5 text-sm ${item.active ? "bg-white text-earth-900 shadow-sm" : "text-white/70"}`}
              >
                <span className="font-medium">{item.label}</span>
                {item.detail ? <span className={item.active ? "text-earth-500" : "text-white/40"}>{item.detail}</span> : null}
              </div>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
            <p className="text-xs text-white/50">排程資源模式</p>
            <p className="mt-1.5 text-sm font-semibold">管理芳療師時間</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <ModuleSetting label="號牌顯示" value="號碼＋姓名" />
              <ModuleSetting label="療程緩衝" value="可設定" />
            </dl>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
          <header className="flex flex-col gap-5 border-b border-earth-200/80 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">SPA 人員排程</span>
                <span className="text-xs text-earth-500">互動預覽・不寫入正式資料</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{industryModule.manager.dashboardLabel}</h1>
              <p className="mt-1 text-sm text-earth-500">手機展示顧客端，筆電／iPad 展示店長端</p>
            </div>
            <div className="w-full max-w-sm xl:w-80"><ModulePreviewSwitcher active="manager" /></div>
          </header>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite">{notice}</p>
            <button type="button" onClick={openFirstAvailableSlot} className="min-h-10 shrink-0 rounded-xl bg-earth-900 px-4 font-semibold text-white">＋ 現場快速預約</button>
          </div>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="今日營運摘要">
            <MetricCard label="今日預約" value={String(dayBookings.length)} unit="筆" detail={`${previewProviders.length} 位芳療師`} />
            <MetricCard label="待服務" value={String(activeCount)} unit="筆" detail={activeCount ? "可逐筆確認到店" : "今日服務已完成"} />
            <MetricCard label="新顧客" value={String(newCustomerCount)} unit="位" detail={newCustomerCount ? "初次體驗" : "目前沒有新客"} emphasized />
            <MetricCard label="人員排程" value="3" unit="位" detail="號牌 08・12・16" />
          </section>

          <div className="mt-6 grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70">
              <div className="flex flex-col gap-4 border-b border-earth-100 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">時間 × 芳療師</h2>
                  <p className="mt-1 text-sm text-earth-500">月曆負責選日期，這張表負責管理當天人員</p>
                </div>
                <DateSelector dayIndex={dayIndex} onChooseDay={chooseDay} />
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead>
                    <tr className="bg-earth-50/90 text-sm">
                      <th className="sticky left-0 z-20 w-20 border-b border-r border-earth-100 bg-earth-50 px-4 py-4 font-medium text-earth-500">時間</th>
                      {previewProviders.map((provider) => <ProviderHeader key={provider.id} provider={provider} />)}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleTimes.map((time) => (
                      <tr key={time}>
                        <th className="sticky left-0 z-10 border-b border-r border-earth-100 bg-white px-4 py-4 align-top text-sm font-semibold tabular-nums text-earth-700">{time}</th>
                        {previewProviders.map((provider) => {
                          const booking = dayBookings.find((candidate) => candidate.time === time && candidate.providerId === provider.id);
                          const blocked = blockedSlots[slotKey(selectedDay.key, time, provider.id)];
                          return (
                            <td key={provider.id} className="h-28 border-b border-r border-earth-100 p-2 align-top last:border-r-0">
                              {booking ? (
                                <ScheduleBooking booking={booking} selected={booking.id === selectedBookingId} onOpen={openBooking} />
                              ) : blocked ? (
                                <BlockedSlot label={blocked} />
                              ) : (
                                <EmptySlot label={`${time}・${provider.badge}號 ${provider.name}`} onOpen={() => openQuickBooking({ date: selectedDay.key, time, providerId: provider.id })} />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-4 lg:hidden">
                <p className="rounded-xl bg-earth-50 px-3 py-2 text-xs text-earth-500">iPad 直向／窄螢幕使用預約清單；橫向後會切換成人員欄位表。</p>
                {dayBookings.length ? dayBookings.toSorted(sortBookings).map((booking) => (
                  <MobileBookingCard key={booking.id} booking={booking} onOpen={openBooking} />
                )) : <p className="py-10 text-center text-sm text-earth-400">這一天目前沒有預約</p>}
              </div>
            </section>

            <aside className="grid content-start gap-5" aria-label="預約操作區">
              {quickSlot ? (
                <QuickBookingForm slot={quickSlot} onCancel={() => setQuickSlot(null)} onSubmit={createQuickBooking} />
              ) : selectedBooking ? (
                <BookingDetail booking={selectedBooking} onStatusChange={updateBookingStatus} onRebook={requestRebooking} />
              ) : (
                <EmptyDetail />
              )}

              <section className="rounded-2xl bg-white p-5 shadow-[0_8px_24px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70">
                <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">今日提醒</h2><span className="rounded-full bg-earth-100 px-2 py-1 text-xs text-earth-500">2 項</span></div>
                <div className="mt-4 space-y-3"><AlertItem title="新客首次到店" detail="服務前確認注意事項" tone="rose" /><AlertItem title="療程即將到期" detail="完成服務後提醒續購" tone="sand" /></div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function DateSelector({ dayIndex, onChooseDay }: { dayIndex: number; onChooseDay: (index: number) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto" aria-label="選擇排程日期">
      <button type="button" disabled={dayIndex === 0} onClick={() => onChooseDay(dayIndex - 1)} className="min-h-10 shrink-0 rounded-lg border border-earth-200 bg-earth-50 px-3 text-earth-600 disabled:opacity-35">前一天</button>
      {scheduleDays.map((day, index) => (
        <button type="button" key={day.key} onClick={() => onChooseDay(index)} aria-pressed={dayIndex === index} className={`min-h-10 shrink-0 rounded-lg px-3 font-semibold ${dayIndex === index ? "bg-earth-900 text-white" : "border border-earth-200 bg-white text-earth-600"}`}>
          {day.shortLabel}（{day.weekday}）{day.today ? " 今天" : ""}
        </button>
      ))}
      <button type="button" disabled={dayIndex === scheduleDays.length - 1} onClick={() => onChooseDay(dayIndex + 1)} className="min-h-10 shrink-0 rounded-lg border border-earth-200 bg-earth-50 px-3 text-earth-600 disabled:opacity-35">後一天</button>
    </div>
  );
}

function ProviderHeader({ provider }: { provider: PreviewProvider }) {
  return <th className="border-b border-r border-earth-100 px-4 py-4 last:border-r-0"><div className="flex items-center gap-3"><span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-primary-100 px-2 text-xs font-bold text-primary-700">{provider.badge}號</span><div><p className="font-semibold text-earth-900">{provider.name}</p><p className="mt-0.5 text-xs font-normal text-earth-500">{provider.specialties}</p></div></div></th>;
}

function ScheduleBooking({ booking, selected, onOpen }: { booking: PreviewBooking; selected: boolean; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(booking.id)} aria-pressed={selected} className={`h-full w-full rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${toneClasses[booking.tone]} ${selected ? "ring-2 ring-earth-700 ring-offset-1" : ""}`}>
      <span className="flex items-start justify-between gap-2"><span className="font-semibold text-earth-900">{booking.customer}</span><span className="shrink-0 text-[11px] font-semibold">{booking.status}</span></span>
      <span className="mt-2 block text-xs leading-relaxed text-earth-700">{booking.service}</span>
    </button>
  );
}

function EmptySlot({ label, onOpen }: { label: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`新增預約：${label}`} className="flex h-full min-h-20 w-full items-center justify-center rounded-xl border border-dashed border-earth-200 bg-earth-50/40 text-xs text-earth-400 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700">＋ 可安排</button>;
}

function BlockedSlot({ label }: { label: string }) {
  return <div className="flex h-full min-h-20 items-center justify-center rounded-xl bg-earth-100 text-xs font-medium text-earth-400">{label}</div>;
}

function MobileBookingCard({ booking, onOpen }: { booking: PreviewBooking; onOpen: (id: string) => void }) {
  const provider = getProvider(booking.providerId);
  return <button type="button" onClick={() => onOpen(booking.id)} className={`rounded-xl border p-4 text-left ${toneClasses[booking.tone]}`}><span className="flex items-center justify-between gap-3"><span className="font-semibold text-earth-900">{booking.time}・{booking.customer}</span><span className="text-xs font-semibold">{booking.status}</span></span><span className="mt-2 block text-sm text-earth-700">{booking.service}</span><span className="mt-2 block text-xs text-earth-500">{provider.badge}號 {provider.name}</span></button>;
}

function BookingDetail({ booking, onStatusChange, onRebook }: { booking: PreviewBooking; onStatusChange: (status: BookingStatus) => void; onRebook: () => void }) {
  const provider = getProvider(booking.providerId);
  return (
    <section className="rounded-2xl bg-earth-900 p-5 text-white shadow-[0_12px_32px_rgba(52,47,39,0.14)]">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-earth-300">預約詳情・{booking.time}</p><h2 className="mt-2 text-xl font-semibold">{booking.customer}</h2></div><span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold">{booking.status}</span></div>
      <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm"><DetailRow label="服務項目" value={booking.service} /><DetailRow label="芳療師" value={`${provider.badge}號 ${provider.name}`} /><DetailRow label="療程時間" value={`${booking.durationMinutes} 分鐘`} /><DetailRow label="可用次數" value={booking.remainingSessions === null ? "單次／現場付款" : `剩餘 ${booking.remainingSessions} 次`} /><DetailRow label="注意事項" value={booking.note} /></dl>
      <div className="mt-5 grid grid-cols-2 gap-2"><ActionButton label="確認到店" onClick={() => onStatusChange("已到店")} disabled={booking.status === "已完成"} /><ActionButton label="開始服務" onClick={() => onStatusChange("服務中")} disabled={booking.status === "已完成"} /><ActionButton label="完成並扣療程" onClick={() => onStatusChange("已完成")} disabled={booking.status === "已完成"} emphasized /><ActionButton label="再約下一次" onClick={onRebook} /></div>
      <p className="mt-4 rounded-xl bg-white/8 px-3.5 py-3 text-xs leading-relaxed text-earth-200 ring-1 ring-white/10">本頁只操作瀏覽器中的虛構資料；重新整理後復原。</p>
    </section>
  );
}

function QuickBookingForm({ slot, onCancel, onSubmit }: { slot: QuickSlot; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const provider = getProvider(slot.providerId);
  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-earth-500">現場／電話快速預約</p><h2 className="mt-2 text-lg font-semibold">{slot.time}・{provider.badge}號 {provider.name}</h2></div><button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-earth-500 hover:bg-earth-100">關閉</button></div>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-earth-700">顧客姓名<input name="customer" required autoFocus placeholder="例如：陳小姐" className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500" /></label>
        <label className="block text-sm font-medium text-earth-700">服務療程<select name="service" className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500">{SPA_INDUSTRY_MODULE.services.map((service) => <option key={service.key} value={service.key}>{service.name}</option>)}</select></label>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white">加入示範排程</button>
      </form>
    </section>
  );
}

function EmptyDetail() {
  return <section className="rounded-2xl bg-white p-8 text-center ring-1 ring-earth-200/70"><p className="font-semibold">尚未選擇預約</p><p className="mt-2 text-sm text-earth-500">點選預約查看詳情，或點空白時段快速新增。</p></section>;
}

function MetricCard({ label, value, unit, detail, emphasized = false }: { label: string; value: string; unit: string; detail: string; emphasized?: boolean }) {
  return <div className={`rounded-2xl p-5 ring-1 ${emphasized ? "bg-primary-50 ring-primary-100" : "bg-white ring-earth-200/70"}`}><p className="text-sm text-earth-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-earth-900">{value}<span className="ml-1 text-sm font-medium text-earth-500">{unit}</span></p><p className="mt-2 text-xs text-earth-500">{detail}</p></div>;
}

function ActionButton({ label, onClick, disabled = false, emphasized = false }: { label: string; onClick: () => void; disabled?: boolean; emphasized?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${emphasized ? "bg-primary-200 text-primary-900" : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15"}`}>{label}</button>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><dt className="shrink-0 text-earth-400">{label}</dt><dd className="text-right font-medium text-earth-100">{value}</dd></div>;
}

function AlertItem({ title, detail, tone }: { title: string; detail: string; tone: "rose" | "sand" }) {
  return <div className="flex gap-3 rounded-xl bg-earth-50 p-3.5"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone === "rose" ? "bg-[#c78e7c]" : "bg-[#c5a66c]"}`} aria-hidden /><div><p className="text-sm font-semibold text-earth-900">{title}</p><p className="mt-1 text-xs text-earth-500">{detail}</p></div></div>;
}

function ModuleSetting({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-white/45">{label}</dt><dd className="mt-1 font-semibold text-white">{value}</dd></div>;
}

function getProvider(providerId: string): PreviewProvider {
  return previewProviders.find((provider) => provider.id === providerId) ?? previewProviders[0];
}

function slotKey(date: string, time: string, providerId: string) {
  return `${date}:${time}:${providerId}`;
}

function sortBookings(a: PreviewBooking, b: PreviewBooking) {
  return a.time.localeCompare(b.time) || a.providerId.localeCompare(b.providerId);
}
