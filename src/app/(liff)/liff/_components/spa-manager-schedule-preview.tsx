"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { completeSpaDemoBooking } from "@/server/actions/spa-demo-checkout";
import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import {
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_PROVIDERS,
  type SpaDemoBooking as PreviewBooking,
  type SpaDemoBookingStatus as BookingStatus,
  type SpaDemoProvider as PreviewProvider,
  type SpaDemoTone as Tone,
} from "@/lib/spa-demo-store";
import {
  addMinutes,
  canProviderPerformServices,
  composeSpaServices,
  hasContinuousAvailability,
  SPA_SERVICE_MENU,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";

type QuickSlot = {
  date: string;
  time: string;
  providerId: string;
};

const scheduleDays = [
  { key: "2026-08-28", shortLabel: "8/28", weekday: "五", today: false },
  { key: "2026-08-29", shortLabel: "8/29", weekday: "六", today: true },
  { key: "2026-08-30", shortLabel: "8/30", weekday: "日", today: false },
] as const;

const scheduleTimes = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
] as const;

// Detail subcomponents use the same immutable allowlist as the server loader.
const previewProviders = SPA_DEMO_PROVIDERS;

const blockedRanges = [
  { date: "2026-08-29", providerId: "spa-demo-staff-08", startTime: "13:00", durationMinutes: 60, label: "午休" },
  { date: "2026-08-29", providerId: "spa-demo-staff-10", startTime: "13:00", durationMinutes: 60, label: "午休" },
  { date: "2026-08-29", providerId: "spa-demo-staff-16", startTime: "13:30", durationMinutes: 60, label: "午休" },
  { date: "2026-08-29", providerId: "spa-demo-staff-10", startTime: "17:30", durationMinutes: 210, label: "提早下班" },
  { date: "2026-08-30", providerId: "spa-demo-staff-16", startTime: "10:00", durationMinutes: 660, label: "休假" },
] as const;

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

export function SpaManagerSchedulePreview({
  initialProviders = SPA_DEMO_PROVIDERS,
  initialBookings = SPA_DEMO_BOOKINGS,
  previewDate = "2026-08-29",
}: {
  initialProviders?: readonly PreviewProvider[];
  initialBookings?: readonly PreviewBooking[];
  previewDate?: string;
}) {
  const industryModule = SPA_INDUSTRY_MODULE;
  const activeProviders = initialProviders;
  const [bookings, setBookings] = useState<PreviewBooking[]>(() => [...initialBookings]);
  const [dayIndex, setDayIndex] = useState(() => {
    const index = scheduleDays.findIndex((day) => day.key === previewDate);
    return index >= 0 ? index : 1;
  });
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [quickSlot, setQuickSlot] = useState<QuickSlot | null>(null);
  const [notice, setNotice] = useState("點選預約可查看詳情，點選空白時段可快速新增。");
  const [isCompleting, startCompleting] = useTransition();

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

  function updateBookingStatus(status: BookingStatus, settlementLabel?: string, settlementAmount?: number, storedValueBalance?: number | null, packageRemainingSessions?: number | null) {
    if (!selectedBookingId) return;
    setBookings((current) => current.map((booking) => {
      if (booking.id !== selectedBookingId) return booking;
      const remainingSessions = status === "已完成" && booking.remainingSessions !== null
        ? Math.max(booking.remainingSessions - 1, 0)
        : booking.remainingSessions;
      return { ...booking, status, remainingSessions, tone: status === "已完成" ? "slate" : booking.tone, settlementLabel, settlementAmount, storedValueBalance: storedValueBalance ?? booking.storedValueBalance, packageRemainingSessions: packageRemainingSessions ?? booking.packageRemainingSessions };
    }));
    setNotice(status === "已完成" ? "服務已完成，療程次數已扣除 1 次。" : `預約狀態已更新為「${status}」。`);
  }

  function completeBooking(settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") {
    if (!selectedBookingId) return;
    const bookingId = selectedBookingId;
    if (bookingId !== SPA_DEMO_LIVE_FLOW_BOOKING_ID) {
      const label = { CASH: "現金", CREDIT_CARD: "刷卡", STORED_VALUE: "儲值金", PACKAGE: "扣療程 1 次" }[settlement];
      const booking = bookings.find((item) => item.id === bookingId);
      updateBookingStatus("已完成", label, booking?.remainingSessions === null ? 0 : undefined);
      setNotice(`服務與結帳已完成：${label}。`);
      return;
    }
    startCompleting(async () => {
      const result = await completeSpaDemoBooking({ bookingId, settlement });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      updateBookingStatus("已完成", result.data.settlementLabel, result.data.amount, result.data.storedValueBalance, result.data.packageRemainingSessions);
      setNotice(`服務與結帳已一次完成：${result.data.settlementLabel}${result.data.amount ? `・NT$${result.data.amount.toLocaleString()}` : ""}。`);
    });
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
    const primaryKey = String(formData.get("primaryService") ?? "aroma_body_60");
    const addOnKeys = formData.getAll("addOn").map(String);
    const serviceItems = composeSpaServices(primaryKey, addOnKeys);
    const serviceSummary = summarizeSpaServices(serviceItems);
    const provider = getProvider(quickSlot.providerId);
    if (!customer) return;

    if (!canProviderPerformServices(provider.specialtyKeys, serviceItems)) {
      setNotice(`${provider.badge}號無法完成全部所選項目，請改選其他芳療師。`);
      return;
    }
    if (!isAvailable(quickSlot.date, quickSlot.time, provider.id, serviceSummary.durationMinutes, 30, bookings)) {
      setNotice(`從 ${quickSlot.time} 起沒有連續 ${serviceSummary.durationMinutes} 分鐘服務＋30 分鐘整理空檔。`);
      return;
    }

    const booking: PreviewBooking = {
      id: `preview-${Date.now()}`,
      date: quickSlot.date,
      time: quickSlot.time,
      customer,
      service: serviceItems.map((item) => item.name).join("＋"),
      serviceItems: serviceItems.map((item) => `${item.name} ${item.durationMinutes} 分`),
      providerId: quickSlot.providerId,
      durationMinutes: serviceSummary.durationMinutes,
      bufferMinutes: 30,
      status: "已確認",
      tone: "sage",
      remainingSessions: null,
      note: "由店長於現場／電話快速建立",
    };
    setBookings((current) => [...current, booking]);
    setSelectedBookingId(booking.id);
    setQuickSlot(null);
    setNotice(`${customer} 的預約已加入排程。`);
  }

  function openFirstAvailableSlot() {
    for (const time of scheduleTimes) {
      for (const provider of activeProviders) {
        if (isAvailable(selectedDay.key, time, provider.id, 60, 30, bookings)) {
          openQuickBooking({ date: selectedDay.key, time, providerId: provider.id });
          return;
        }
      }
    }
    setNotice("這一天目前沒有可快速安排的時段。");
  }

  return (
    <div className="spa-preview-page min-h-screen bg-[#f5f3ee] text-earth-900">
      <style>{`.liff-customer-ui:has(.spa-preview-page) > footer { display: none; }`}</style>
      <div className="mx-auto min-h-screen max-w-[1600px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-earth-200/80 bg-[#2f352b] px-5 py-7 text-white lg:flex lg:flex-col">
          <div className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary-200">蒸管家</p>
            <p className="mt-2 text-lg font-semibold">沐光舒療 SPA</p>
            <p className="mt-1 text-xs text-white/55">店長管理後台</p>
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


        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
          <header className="border-b border-earth-200/80 pb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">SPA 人員排程</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{industryModule.manager.dashboardLabel}</h1>
            </div>
          </header>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite">{notice}</p>
            <button type="button" onClick={openFirstAvailableSlot} className="min-h-10 shrink-0 rounded-xl bg-earth-900 px-4 font-semibold text-white">＋ 現場快速預約</button>
          </div>

          <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="今日營運摘要">
            <MetricCard label="今日預約" value={String(dayBookings.length)} unit="筆" detail={`${activeProviders.length} 位芳療師`} />
            <MetricCard label="待服務" value={String(activeCount)} unit="筆" detail={activeCount ? "可逐筆完成服務" : "今日服務已完成"} />
            <MetricCard label="新顧客" value={String(newCustomerCount)} unit="位" detail={newCustomerCount ? "初次體驗" : "目前沒有新客"} emphasized />
            <MetricCard label="人員排程" value="3" unit="位" detail="號牌 08・10・16" />
          </section>

          <div className="mt-6 grid min-w-0 gap-6">
            <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70">
              <div className="flex flex-col gap-4 border-b border-earth-100 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">時間 × 芳療師</h2>
                </div>
                <DateSelector dayIndex={dayIndex} onChooseDay={chooseDay} />
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-[80px_repeat(3,minmax(240px,1fr))] bg-earth-50/90 text-sm">
                    <div className="sticky left-0 z-20 border-b border-r border-earth-100 bg-earth-50 px-4 py-4 font-medium text-earth-500">時間</div>
                    {activeProviders.map((provider) => <ProviderHeader key={provider.id} provider={provider} />)}
                  </div>
                  <div className="grid grid-cols-[80px_repeat(3,minmax(240px,1fr))]">
                    <div className="sticky left-0 z-20 grid bg-white" style={{ gridTemplateRows: `repeat(${scheduleTimes.length}, 52px)` }}>
                      {scheduleTimes.map((time) => <div key={time} className="border-b border-r border-earth-100 px-3 py-2 text-xs font-semibold tabular-nums text-earth-600">{time}</div>)}
                    </div>
                    {activeProviders.map((provider) => (
                      <ScheduleProviderColumn
                        key={provider.id}
                        provider={provider}
                        date={selectedDay.key}
                        bookings={dayBookings}
                        selectedBookingId={selectedBookingId}
                        onOpenBooking={openBooking}
                        onOpenQuickBooking={openQuickBooking}
                      />
                    ))}
                  </div>
                </div>
              </div>

            </section>

            <aside aria-label="今日提醒">
              <section className="rounded-2xl bg-white p-5 shadow-[0_8px_24px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70">
                <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">今日提醒</h2><span className="rounded-full bg-earth-100 px-2 py-1 text-xs text-earth-500">2 項</span></div>
                <div className="mt-4 space-y-3"><AlertItem title="新客首次到店" detail="服務前確認注意事項" tone="rose" /><AlertItem title="療程即將到期" detail="完成服務後提醒續購" tone="sand" /></div>
              </section>
            </aside>
          </div>
        </main>
      </div>

      {quickSlot || selectedBooking ? (
        <div className="fixed inset-0 z-50 bg-black/25" onClick={() => { setQuickSlot(null); setSelectedBookingId(null); }}>
          <aside className="ml-auto h-full w-full max-w-[430px] overflow-y-auto bg-[#f7f5f0] p-5 shadow-2xl" aria-label="預約右側操作面板" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-earth-700">預約操作</p>
              <button type="button" onClick={() => { setQuickSlot(null); setSelectedBookingId(null); }} className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-600">關閉</button>
            </div>
            {quickSlot ? (
              <QuickBookingForm slot={quickSlot} onCancel={() => setQuickSlot(null)} onSubmit={createQuickBooking} />
            ) : selectedBooking ? (
              <BookingDetail booking={selectedBooking} onComplete={completeBooking} isCompleting={isCompleting} onRebook={requestRebooking} />
            ) : null}
          </aside>
        </div>
      ) : null}
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
  return <div className="border-b border-r border-earth-100 px-4 py-4 last:border-r-0"><div className="flex items-center gap-3"><span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-primary-100 px-2 text-xs font-bold text-primary-700">{provider.badge}號</span><div><p className="font-semibold text-earth-900">{provider.name}</p><p className="mt-0.5 text-xs font-normal text-earth-500">{provider.specialties}</p></div></div></div>;
}

function ScheduleProviderColumn({
  provider,
  date,
  bookings,
  selectedBookingId,
  onOpenBooking,
  onOpenQuickBooking,
}: {
  provider: PreviewProvider;
  date: string;
  bookings: readonly PreviewBooking[];
  selectedBookingId: string | null;
  onOpenBooking: (id: string) => void;
  onOpenQuickBooking: (slot: QuickSlot) => void;
}) {
  const providerBookings = bookings.filter((booking) => booking.providerId === provider.id);
  const providerBlocks = blockedRanges.filter((range) => range.date === date && range.providerId === provider.id);

  return (
    <div className="relative grid border-r border-earth-100 last:border-r-0" style={{ gridTemplateRows: `repeat(${scheduleTimes.length}, 52px)` }}>
      {scheduleTimes.map((time, index) => {
        const available = isAvailable(date, time, provider.id, 30, 0, bookings);
        return (
          <div key={time} className="border-b border-earth-100 p-1" style={{ gridColumn: 1, gridRow: index + 1 }}>
            {available ? <EmptySlot label={`${time}・${provider.badge}號 ${provider.name}`} onOpen={() => onOpenQuickBooking({ date, time, providerId: provider.id })} /> : null}
          </div>
        );
      })}
      {providerBlocks.map((range) => (
        <div key={`${range.startTime}-${range.label}`} className="z-10 p-1" style={{ gridColumn: 1, gridRow: `${rowForTime(range.startTime)} / span ${rowsForMinutes(range.durationMinutes)}` }}>
          <BlockedSlot label={range.label} />
        </div>
      ))}
      {providerBookings.map((booking) => (
        <div key={booking.id} className="z-20 p-1" style={{ gridColumn: 1, gridRow: `${rowForTime(booking.time)} / span ${rowsForMinutes(booking.durationMinutes)}` }}>
          <ScheduleBooking booking={booking} selected={booking.id === selectedBookingId} onOpen={onOpenBooking} />
        </div>
      ))}
      {providerBookings.filter((booking) => booking.bufferMinutes > 0).map((booking) => (
        <div key={`${booking.id}-buffer`} className="z-10 p-1" style={{ gridColumn: 1, gridRow: `${rowForTime(addMinutes(booking.time, booking.durationMinutes))} / span ${rowsForMinutes(booking.bufferMinutes)}` }}>
          <BlockedSlot label={`整理 ${booking.bufferMinutes} 分`} />
        </div>
      ))}
    </div>
  );
}

function ScheduleBooking({ booking, selected, onOpen }: { booking: PreviewBooking; selected: boolean; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(booking.id)} aria-pressed={selected} className={`h-full w-full rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${toneClasses[booking.tone]} ${selected ? "ring-2 ring-earth-700 ring-offset-1" : ""}`}>
      <span className="flex items-start justify-between gap-2"><span className="font-semibold text-earth-900">{booking.customer}</span><span className="shrink-0 text-[11px] font-semibold">{booking.status}</span></span>
      <span className="mt-2 block text-xs leading-relaxed text-earth-700">{booking.service}</span>
      <span className="mt-2 block text-[11px] font-semibold tabular-nums text-earth-600">{booking.time}–{addMinutes(booking.time, booking.durationMinutes)}・{booking.durationMinutes} 分</span>
    </button>
  );
}

function EmptySlot({ label, onOpen }: { label: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`新增預約：${label}`} className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-earth-200 bg-earth-50/40 text-[11px] text-earth-400 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700">＋ 可安排</button>;
}

function BlockedSlot({ label }: { label: string }) {
  return <div className="flex h-full items-center justify-center rounded-xl bg-earth-100 px-2 text-center text-xs font-medium text-earth-400">{label}</div>;
}

function BookingDetail({ booking, onComplete, isCompleting, onRebook }: { booking: PreviewBooking; onComplete: (settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") => void; isCompleting: boolean; onRebook: () => void }) {
  const provider = getProvider(booking.providerId);
  const [showCheckout, setShowCheckout] = useState(false);
  const [settlement, setSettlement] = useState<"CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE">(booking.remainingSessions === null ? "CASH" : "PACKAGE");
  return (
    <section className="rounded-2xl bg-earth-900 p-5 text-white shadow-[0_12px_32px_rgba(52,47,39,0.14)]">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-earth-300">預約詳情・{booking.time}</p><h2 className="mt-2 text-xl font-semibold">{booking.customer}</h2></div><span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold">{booking.status}</span></div>
      <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm"><DetailRow label="服務項目" value={booking.serviceItems.join("＋")} /><DetailRow label="芳療師" value={`${provider.badge}號 ${provider.name}`} /><DetailRow label="服務時段" value={`${booking.time}–${addMinutes(booking.time, booking.durationMinutes)}`} /><DetailRow label="療程時間" value={`${booking.durationMinutes} 分鐘＋整理 ${booking.bufferMinutes} 分鐘`} /><DetailRow label="可用次數" value={booking.remainingSessions === null ? "單次／現場付款" : `剩餘 ${booking.remainingSessions} 次`} /><DetailRow label="注意事項" value={booking.note} /></dl>
      {booking.id === SPA_DEMO_LIVE_FLOW_BOOKING_ID ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-white/8 p-3 ring-1 ring-white/10"><p className="text-earth-400">儲值金餘額</p><p className="mt-1 font-semibold text-white">NT${(booking.storedValueBalance ?? 0).toLocaleString()}</p></div><div className="rounded-xl bg-white/8 p-3 ring-1 ring-white/10"><p className="text-earth-400">療程剩餘</p><p className="mt-1 font-semibold text-white">{booking.packageRemainingSessions ?? 0} 次</p></div></div> : null}
      {booking.status === "已完成" ? (
        <div className="mt-5 rounded-xl bg-primary-100 px-4 py-3 text-sm font-semibold text-primary-900">已完成・{booking.settlementLabel ?? "結帳完成"}{booking.settlementAmount ? `・NT$${booking.settlementAmount.toLocaleString()}` : ""}</div>
      ) : showCheckout ? (
        <div className="mt-5 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
          <p className="text-sm font-semibold">完成服務與結帳</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([['CASH','現金'],['CREDIT_CARD','刷卡'],['STORED_VALUE','儲值金'],['PACKAGE','扣療程']] as const).map(([value, label]) => (
              <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm ring-1 ${settlement === value ? "bg-primary-100 text-primary-900 ring-primary-200" : "bg-white/5 text-white ring-white/15"}`}><input type="radio" name="spa-demo-settlement" value={value} checked={settlement === value} onChange={() => setSettlement(value)} />{label}</label>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><ActionButton label="返回" onClick={() => setShowCheckout(false)} disabled={isCompleting} /><ActionButton label={isCompleting ? "處理中…" : "確認完成並結帳"} onClick={() => onComplete(settlement)} disabled={isCompleting} emphasized /></div>
        </div>
      ) : (
        <div className="mt-5 grid gap-2"><ActionButton label={booking.remainingSessions === null ? "完成服務並收費" : "完成服務並扣次"} onClick={() => setShowCheckout(true)} emphasized /><ActionButton label="再約下一次" onClick={onRebook} /></div>
      )}
    </section>
  );
}

function QuickBookingForm({ slot, onCancel, onSubmit }: { slot: QuickSlot; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const provider = getProvider(slot.providerId);
  const [primaryKey, setPrimaryKey] = useState("aroma_body_60");
  const [addOnKeys, setAddOnKeys] = useState<readonly string[]>([]);
  const primaryItems = SPA_SERVICE_MENU.filter((item) => item.kind !== "ADD_ON");
  const addOnItems = SPA_SERVICE_MENU.filter((item) => item.kind === "ADD_ON");
  const primary = SPA_SERVICE_MENU.find((item) => item.key === primaryKey) ?? primaryItems[0];
  const selectedItems = composeSpaServices(primaryKey, primary.kind === "COMBO" ? [] : addOnKeys);
  const summary = summarizeSpaServices(selectedItems);

  function toggleAddOn(key: string) {
    setAddOnKeys((current) => current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key]);
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-earth-500">現場／電話快速預約</p><h2 className="mt-2 text-lg font-semibold">{slot.time}・{provider.badge}號 {provider.name}</h2></div><button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-earth-500 hover:bg-earth-100">關閉</button></div>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <div>
          <label htmlFor="spa-preview-customer" className="block text-sm font-medium text-earth-700">顧客姓名</label>
          <input id="spa-preview-customer" name="customer" required autoFocus placeholder="例如：陳小姐" className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500" />
        </div>
        <div><label htmlFor="spa-preview-primary-service" className="block text-sm font-medium text-earth-700">主療程／組合</label><select id="spa-preview-primary-service" name="primaryService" value={primaryKey} onChange={(event) => { setPrimaryKey(event.target.value); setAddOnKeys([]); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500">{primaryItems.map((item) => <option key={item.key} value={item.key}>{item.name}・{item.durationMinutes} 分</option>)}</select></div>
        {primary.kind !== "COMBO" ? <fieldset><legend className="text-sm font-medium text-earth-700">加購項目（可複選）</legend><div className="mt-2 grid gap-2">{addOnItems.map((item) => <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 px-3 py-2 text-sm"><span className="flex items-center gap-2"><input type="checkbox" name="addOn" value={item.key} checked={addOnKeys.includes(item.key)} onChange={() => toggleAddOn(item.key)} />{item.name}</span><span className="shrink-0 text-xs text-earth-500">＋{item.durationMinutes} 分</span></label>)}</div></fieldset> : null}
        <div className="rounded-xl bg-primary-50 px-3.5 py-3 text-sm text-primary-800"><p className="font-semibold">合計 {summary.durationMinutes} 分鐘・NT${summary.price.toLocaleString()}</p><p className="mt-1 text-xs">另保留 30 分鐘整理；送出時會再次檢查連續空檔與芳療師資格。</p></div>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white">加入排程</button>
      </form>
    </section>
  );
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

function isAvailable(
  date: string,
  time: string,
  providerId: string,
  serviceMinutes: number,
  bufferMinutes: number,
  bookings: readonly PreviewBooking[],
) {
  const bookingRanges = bookings
    .filter((booking) => booking.date === date && booking.providerId === providerId)
    .map((booking) => ({
      startTime: booking.time,
      durationMinutes: booking.durationMinutes + booking.bufferMinutes,
    }));
  const unavailableRanges = blockedRanges
    .filter((range) => range.date === date && range.providerId === providerId)
    .map((range) => ({ startTime: range.startTime, durationMinutes: range.durationMinutes }));
  return hasContinuousAvailability({
    startTime: time,
    serviceMinutes,
    bufferMinutes,
    closeTime: "21:00",
    occupiedRanges: [...bookingRanges, ...unavailableRanges],
  });
}

function rowForTime(time: string) {
  const index = scheduleTimes.indexOf(time as (typeof scheduleTimes)[number]);
  return Math.max(index, 0) + 1;
}

function rowsForMinutes(minutes: number) {
  return Math.max(Math.ceil(minutes / 30), 1);
}
