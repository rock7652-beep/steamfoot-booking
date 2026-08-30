"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { completeSpaDemoBooking, completeSpaDemoGuestBooking } from "@/server/actions/spa-demo-checkout";
import { createSpaDemoCustomerBooking } from "@/server/actions/spa-demo-customer-booking";
import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import {
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_PROVIDERS,
  type SpaDemoBooking as PreviewBooking,
  type SpaDemoBookingStatus as BookingStatus,
  type SpaDemoProvider as PreviewProvider,
  type SpaDemoTone as Tone,
} from "@/lib/spa-demo-store";
import {
  addMinutes,
  composeSpaServices,
  SPA_SERVICE_MENU,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";
import { isSpaProviderAvailable } from "@/lib/spa-provider-availability";
import type { SpaBookableProvider } from "@/lib/spa-provider-availability";
import { findSpaPartyProviderAssignment } from "@/lib/spa-party-assignment";

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
  const getActiveProvider = (providerId: string) => (
    activeProviders.find((provider) => provider.id === providerId) ?? activeProviders[0]
  );
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
  const selectedGroupBookings = useMemo(() => {
    if (!selectedBooking) return [];
    if (!SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(selectedBooking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])) {
      return [selectedBooking];
    }
    return bookings.filter((booking) =>
      SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])
      && booking.date === selectedBooking.date
      && booking.time === selectedBooking.time
      && booking.customer === selectedBooking.customer,
    );
  }, [bookings, selectedBooking]);
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
    setNotice(`正在安排 ${slot.time} 的預約。`);
  }

  function updateBookingStatus(bookingIds: readonly string[], status: BookingStatus, settlementLabel?: string, settlementAmount?: number, storedValueBalance?: number | null, packageRemainingSessions?: number | null) {
    if (!bookingIds.length) return;
    setBookings((current) => current.map((booking) => {
      const isTarget = bookingIds.includes(booking.id);
      const isLiveBooking = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number]);
      const walletUpdates = isLiveBooking ? {
        ...(storedValueBalance !== null && storedValueBalance !== undefined ? { storedValueBalance } : {}),
        ...(packageRemainingSessions !== null && packageRemainingSessions !== undefined ? { packageRemainingSessions } : {}),
      } : {};
      if (!isTarget) return { ...booking, ...walletUpdates };
      const remainingSessions = status === "已完成" && booking.remainingSessions !== null
        ? Math.max(booking.remainingSessions - 1, 0)
        : booking.remainingSessions;
      return { ...booking, ...walletUpdates, status, remainingSessions, tone: status === "已完成" ? "slate" : booking.tone, settlementLabel, settlementAmount };
    }));
    setNotice(status === "已完成" ? "服務已完成，療程次數已扣除 1 次。" : `預約狀態已更新為「${status}」。`);
  }

  function completeGuestBooking(bookingId: string, settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") {
    startCompleting(async () => {
      const result = await completeSpaDemoGuestBooking({ bookingId, settlement });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      updateBookingStatus([result.data.bookingId], "已完成", result.data.settlementLabel, result.data.amount, result.data.storedValueBalance, result.data.packageRemainingSessions);
      setNotice(`此位服務與結帳已完成：${result.data.settlementLabel}${result.data.amount ? `・NT$${result.data.amount.toLocaleString()}` : ""}。`);
    });
  }

  function completeBooking(settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") {
    if (!selectedBookingId) return;
    const bookingId = selectedBookingId;
    if (!SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(bookingId as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])) {
      const label = { CASH: "現金", CREDIT_CARD: "刷卡", STORED_VALUE: "儲值金", PACKAGE: "扣療程 1 次" }[settlement];
      const booking = bookings.find((item) => item.id === bookingId);
      updateBookingStatus([bookingId], "已完成", label, booking?.remainingSessions === null ? 0 : undefined);
      setNotice(`服務與結帳已完成：${label}。`);
      return;
    }
    startCompleting(async () => {
      const result = await completeSpaDemoBooking({ bookingId, settlement });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      updateBookingStatus(result.data.bookingIds, "已完成", result.data.settlementLabel, result.data.amount, result.data.storedValueBalance, result.data.packageRemainingSessions);
      setNotice(`服務與結帳已一次完成：${result.data.settlementLabel}${result.data.amount ? `・NT$${result.data.amount.toLocaleString()}` : ""}。`);
    });
  }

  function requestRebooking() {
    if (!selectedBooking) return;
    const provider = getActiveProvider(selectedBooking.providerId);
    if (!provider) return;
    setNotice(`已準備為 ${selectedBooking.customer} 安排下一次；保留 ${provider.badge}號 ${provider.name}，日期與時間重新選擇。`);
  }

  function createQuickBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickSlot) return;
    const formData = new FormData(event.currentTarget);
    const customer = String(formData.get("customer") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const people = Number(formData.get("people") ?? 1);
    const guests = Array.from({ length: people }, (_, index) => {
      const primaryKey = String(formData.get(`guest-${index}-primary`) ?? "");
      const addOnKeys = formData.getAll(`guest-${index}-addOn`).map(String);
      return { primaryKey, addOnKeys, items: composeSpaServices(primaryKey, addOnKeys) };
    });
    const providers = toBookableProviders(activeProviders, bookings);
    const assignment = findSpaPartyProviderAssignment({
      requests: guests.map((guest) => ({ items: guest.items })),
      providers,
      date: quickSlot.date,
      time: quickSlot.time,
    });
    if (!customer || !/^09\d{8}$/.test(phone)) {
      setNotice("請填寫主要聯絡人與正確手機號碼。");
      return;
    }
    if (assignment.length !== people) {
      setNotice("此時段無法同時安排全部服務，請更換時間。");
      return;
    }

    startCompleting(async () => {
      const result = await createSpaDemoCustomerBooking({
        bookingDate: quickSlot.date,
        slotTime: quickSlot.time,
        bookingSource: "MANAGER",
        primaryContact: { name: customer, phone },
        guests: guests.map((guest, index) => ({
          providerId: assignment[index].id,
          primaryKey: guest.primaryKey,
          addOnKeys: guest.addOnKeys,
        })),
      });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      const nextBookings: PreviewBooking[] = guests.map((guest, index) => {
        const summary = summarizeSpaServices(guest.items);
        return {
          id: SPA_DEMO_LIVE_FLOW_BOOKING_IDS[index],
          date: quickSlot.date,
          time: quickSlot.time,
          customer,
          service: guest.items.map((item) => item.name.replace("加購", "")).join("＋"),
          serviceItems: guest.items.map((item) => item.name.replace("加購", "")),
          providerId: assignment[index].id,
          durationMinutes: summary.durationMinutes,
          bufferMinutes: 30,
          status: "已確認",
          tone: "sage",
          remainingSessions: null,
          note: "無",
          partySize: people,
          guestIndex: index + 1,
          price: summary.price,
          storedValueBalance: 5000,
          packageRemainingSessions: 5,
        };
      });
      setBookings((current) => [
        ...current.filter((booking) => !SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])),
        ...nextBookings,
      ]);
      setSelectedBookingId(nextBookings[0].id);
      setQuickSlot(null);
      setNotice(`${customer} 共 ${people} 位的預約已加入排程。`);
    });
  }

  function openFirstAvailableSlot() {
    for (const time of scheduleTimes) {
      for (const provider of activeProviders) {
        if (isAvailable(selectedDay.key, time, provider, 60, 30, bookings)) {
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
            <MetricCard label="人員排程" value={String(activeProviders.length)} unit="位" detail={activeProviders.map((provider) => `${provider.badge}號`).join("・")} />
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
                <div style={{ minWidth: `${80 + Math.max(activeProviders.length, 1) * 240}px` }}>
                  <div className="grid bg-earth-50/90 text-sm" style={{ gridTemplateColumns: `80px repeat(${Math.max(activeProviders.length, 1)}, minmax(240px, 1fr))` }}>
                    <div className="sticky left-0 z-20 border-b border-r border-earth-100 bg-earth-50 px-4 py-4 font-medium text-earth-500">時間</div>
                    {activeProviders.map((provider) => <ProviderHeader key={provider.id} provider={provider} />)}
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: `80px repeat(${Math.max(activeProviders.length, 1)}, minmax(240px, 1fr))` }}>
                    <div className="sticky left-0 z-20 grid bg-white" style={{ gridTemplateRows: `repeat(${scheduleTimes.length}, 52px)` }}>
                      {scheduleTimes.map((time) => <div key={time} className="border-b border-r border-earth-100 px-3 py-2 text-xs font-semibold tabular-nums text-earth-600">{time}</div>)}
                    </div>
                    {activeProviders.map((provider) => (
                      <ScheduleProviderColumn
                        key={provider.id}
                        provider={provider}
                        date={selectedDay.key}
                        bookings={dayBookings}
                        selectedBookingIds={selectedGroupBookings.map((booking) => booking.id)}
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
            <QuickBookingForm providers={toBookableProviders(activeProviders, bookings)} slot={quickSlot} onCancel={() => setQuickSlot(null)} onSubmit={createQuickBooking} isSubmitting={isCompleting} />
            ) : selectedBooking ? (
              <BookingDetail key={selectedGroupBookings.map((booking) => booking.id).join("|")} providers={selectedGroupBookings.map((booking) => getActiveProvider(booking.providerId)).filter((provider): provider is PreviewProvider => Boolean(provider))} bookings={selectedGroupBookings} booking={selectedBooking} onCompleteGroup={completeBooking} onCompleteGuest={completeGuestBooking} isCompleting={isCompleting} onRebook={requestRebooking} />
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
  selectedBookingIds,
  onOpenBooking,
  onOpenQuickBooking,
}: {
  provider: PreviewProvider;
  date: string;
  bookings: readonly PreviewBooking[];
  selectedBookingIds: readonly string[];
  onOpenBooking: (id: string) => void;
  onOpenQuickBooking: (slot: QuickSlot) => void;
}) {
  const providerBookings = bookings.filter((booking) => booking.providerId === provider.id);
  const providerBlocks = blockedRanges.filter((range) => range.date === date && range.providerId === provider.id);

  return (
    <div className="relative grid border-r border-earth-100 last:border-r-0" style={{ gridTemplateRows: `repeat(${scheduleTimes.length}, 52px)` }}>
      {scheduleTimes.map((time, index) => {
        const available = isAvailable(date, time, provider, 30, 0, bookings);
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
          <ScheduleBooking booking={booking} selected={selectedBookingIds.includes(booking.id)} onOpen={onOpenBooking} />
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
      <span className="flex items-start justify-between gap-2"><span className="font-semibold text-earth-900">{booking.customer}</span><span className="shrink-0 text-[11px] font-semibold">{booking.partySize && booking.partySize > 1 ? `${booking.partySize}位・${booking.status}` : booking.status}</span></span>
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

function BookingDetail({ providers, bookings, booking, onCompleteGroup, onCompleteGuest, isCompleting, onRebook }: { providers: readonly PreviewProvider[]; bookings: readonly PreviewBooking[]; booking: PreviewBooking; onCompleteGroup: (settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") => void; onCompleteGuest: (bookingId: string, settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") => void; isCompleting: boolean; onRebook: () => void }) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<"GROUP" | "SPLIT">("GROUP");
  const [settlement, setSettlement] = useState<"CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE">(booking.remainingSessions === null ? "CASH" : "PACKAGE");
  const [guestSettlements, setGuestSettlements] = useState<Record<string, "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE">>(() => Object.fromEntries(bookings.map((item) => [item.id, "CASH"])));
  const orderedBookings = [...bookings].sort((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
  const people = Math.max(bookings.length, booking.partySize ?? 1);
  const completedCount = bookings.filter((item) => item.status === "已完成").length;
  const allCompleted = completedCount === people;
  const someCompleted = completedCount > 0 && !allCompleted;
  const isLiveGroup = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number]);
  const expectedAmount = bookings.reduce((total, item) => total + (item.price ?? 0), 0);
  const settlementOptions = [
    ["CASH", "現金"],
    ["CREDIT_CARD", "刷卡"],
    ["STORED_VALUE", "主要聯絡人儲值金"],
    ["PACKAGE", checkoutMode === "GROUP" ? `主要聯絡人療程 ${people} 次` : "主要聯絡人療程 1 次"],
  ] as const;
  return (
    <section className="rounded-2xl bg-earth-900 p-5 text-white shadow-[0_12px_32px_rgba(52,47,39,0.14)]">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-earth-300">同行預約・{booking.time}</p><h2 className="mt-2 text-xl font-semibold">{booking.customer}</h2></div><span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold">{completedCount}/{people} 已完成</span></div>
      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        {orderedBookings.map((item, index) => {
          const provider = providers.find((candidate) => candidate.id === item.providerId);
          const guestSettlement = guestSettlements[item.id] ?? "CASH";
          const guestSettlementOptions = index === 0 ? settlementOptions : settlementOptions.slice(0, 2);
          return (
            <div key={item.id} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{index === 0 ? "第 1 位" : `同行者 ${index + 1}`}</p><span className="text-xs text-earth-300">{item.status}</span></div>
              <p className="mt-2 text-sm text-earth-100">{item.serviceItems.join("＋")}</p>
              <div className="mt-2 grid gap-1 text-xs text-earth-300"><p>{provider ? `${provider.badge}號 ${provider.name}` : "尚未指派"}</p><p>{item.time}–{addMinutes(item.time, item.durationMinutes)}・{item.durationMinutes} 分鐘</p>{item.price ? <p>NT${item.price.toLocaleString()}</p> : null}</div>
              {item.status === "已完成" ? <p className="mt-3 rounded-xl bg-primary-100 px-3 py-2 text-xs font-semibold text-primary-900">已結帳・{item.settlementLabel ?? "完成"}</p> : showCheckout && (checkoutMode === "SPLIT" || someCompleted) ? (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {guestSettlementOptions.map(([value, label]) => <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-xs ring-1 ${guestSettlement === value ? "bg-primary-100 text-primary-900 ring-primary-200" : "bg-white/5 text-white ring-white/15"}`}><input type="radio" name={`spa-demo-split-${item.id}`} checked={guestSettlement === value} onChange={() => setGuestSettlements((current) => ({ ...current, [item.id]: value }))} />{label}</label>)}
                  </div>
                  <div className="mt-2"><ActionButton label={isCompleting ? "處理中…" : "完成此位並結帳"} onClick={() => onCompleteGuest(item.id, guestSettlement)} disabled={isCompleting} emphasized /></div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {expectedAmount > 0 ? <div className="mt-4 flex items-center justify-between text-sm"><span className="text-earth-300">整組合計</span><span className="font-semibold">NT${expectedAmount.toLocaleString()}</span></div> : null}
      {isLiveGroup ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-white/8 p-3 ring-1 ring-white/10"><p className="text-earth-400">儲值金餘額</p><p className="mt-1 font-semibold text-white">NT${(booking.storedValueBalance ?? 0).toLocaleString()}</p></div><div className="rounded-xl bg-white/8 p-3 ring-1 ring-white/10"><p className="text-earth-400">療程剩餘</p><p className="mt-1 font-semibold text-white">{booking.packageRemainingSessions ?? 0} 次</p></div></div> : null}
      {allCompleted ? (
        <div className="mt-5 grid gap-2"><div className="rounded-xl bg-primary-100 px-4 py-3 text-sm font-semibold text-primary-900">整組服務已完成</div><ActionButton label="再約下一次" onClick={onRebook} /></div>
      ) : showCheckout ? (
        <div className="mt-5 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
          {!someCompleted && people > 1 ? <div className="grid grid-cols-2 gap-2"><ActionButton label="整組付款" onClick={() => setCheckoutMode("GROUP")} emphasized={checkoutMode === "GROUP"} /><ActionButton label="分開付款" onClick={() => setCheckoutMode("SPLIT")} emphasized={checkoutMode === "SPLIT"} /></div> : null}
          {checkoutMode === "GROUP" && !someCompleted ? <><p className="mt-4 text-sm font-semibold">整組完成與結帳</p><div className="mt-3 grid grid-cols-2 gap-2">{settlementOptions.map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm ring-1 ${settlement === value ? "bg-primary-100 text-primary-900 ring-primary-200" : "bg-white/5 text-white ring-white/15"}`}><input type="radio" name="spa-demo-settlement" value={value} checked={settlement === value} onChange={() => setSettlement(value)} />{label}</label>)}</div><div className="mt-3"><ActionButton label={isCompleting ? "處理中…" : "整組完成並結帳"} onClick={() => onCompleteGroup(settlement)} disabled={isCompleting} emphasized /></div></> : null}
          <div className="mt-3"><ActionButton label="返回" onClick={() => setShowCheckout(false)} disabled={isCompleting} /></div>
        </div>
      ) : (
        <div className="mt-5 grid gap-2"><ActionButton label="完成服務與結帳" onClick={() => { setCheckoutMode(someCompleted ? "SPLIT" : "GROUP"); setShowCheckout(true); }} emphasized /><ActionButton label="再約下一次" onClick={onRebook} /></div>
      )}
    </section>
  );
}

type QuickGuestSelection = {
  primaryKey: string;
  addOnKeys: readonly string[];
};

const emptyQuickGuest = (): QuickGuestSelection => ({ primaryKey: "aroma_body_60", addOnKeys: [] });

function QuickBookingForm({ providers, slot, onCancel, onSubmit, isSubmitting }: { providers: readonly SpaBookableProvider[]; slot: QuickSlot; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; isSubmitting: boolean }) {
  const [people, setPeople] = useState(1);
  const [guests, setGuests] = useState<readonly QuickGuestSelection[]>([emptyQuickGuest()]);
  const [activeGuestIndex, setActiveGuestIndex] = useState(0);
  const primaryItems = SPA_SERVICE_MENU.filter((item) => item.kind !== "ADD_ON");
  const addOnItems = SPA_SERVICE_MENU.filter((item) => item.kind === "ADD_ON");
  const activeGuest = guests[activeGuestIndex] ?? guests[0];
  const activePrimary = SPA_SERVICE_MENU.find((item) => item.key === activeGuest.primaryKey) ?? primaryItems[0];
  const guestItems = guests.map((guest) => composeSpaServices(guest.primaryKey, guest.addOnKeys));
  const guestSummaries = guestItems.map(summarizeSpaServices);
  const assignment = findSpaPartyProviderAssignment({ requests: guestItems.map((items) => ({ items })), providers, date: slot.date, time: slot.time });
  const totalPrice = guestSummaries.reduce((total, summary) => total + summary.price, 0);

  function changePeople(count: number) {
    setPeople(count);
    setGuests((current) => Array.from({ length: count }, (_, index) => current[index] ?? emptyQuickGuest()));
    setActiveGuestIndex((current) => Math.min(current, count - 1));
  }

  function updateActiveGuest(update: (guest: QuickGuestSelection) => QuickGuestSelection) {
    setGuests((current) => current.map((guest, index) => index === activeGuestIndex ? update(guest) : guest));
  }

  function toggleAddOn(key: string) {
    updateActiveGuest((guest) => ({
      ...guest,
      addOnKeys: guest.addOnKeys.includes(key)
        ? guest.addOnKeys.filter((candidate) => candidate !== key)
        : [...guest.addOnKeys, key],
    }));
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-earth-500">現場／電話快速預約</p><h2 className="mt-2 text-lg font-semibold">{slot.time}・芳療師不指定</h2></div><button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-earth-500 hover:bg-earth-100">關閉</button></div>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-2"><div><label htmlFor="spa-preview-customer" className="block text-sm font-medium text-earth-700">主要聯絡人</label><input id="spa-preview-customer" name="customer" required autoFocus placeholder="例如：陳小姐" className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500" /></div><div><label htmlFor="spa-preview-phone" className="block text-sm font-medium text-earth-700">電話</label><input id="spa-preview-phone" name="phone" required inputMode="tel" pattern="09[0-9]{8}" placeholder="0912345678" className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500" /></div></div>
        <fieldset><legend className="text-sm font-medium text-earth-700">人數</legend><input type="hidden" name="people" value={people} /><div className="mt-2 grid grid-cols-3 gap-2">{[1, 2, 3].map((count) => <button key={count} type="button" onClick={() => changePeople(count)} className={`min-h-11 rounded-xl text-sm font-semibold ring-1 ${people === count ? "bg-earth-900 text-white ring-earth-900" : "bg-white text-earth-700 ring-earth-200"}`}>{count} 位</button>)}</div></fieldset>
        <div className="flex gap-2">{guests.map((guest, index) => <button key={index} type="button" onClick={() => setActiveGuestIndex(index)} className={`min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold ring-1 ${activeGuestIndex === index ? "bg-primary-100 text-primary-900 ring-primary-200" : "bg-white text-earth-600 ring-earth-200"}`}>{index === 0 ? "第 1 位" : `第 ${index + 1} 位`}</button>)}</div>
        {guests.map((guest, index) => <div key={index} className={index === activeGuestIndex ? "space-y-4" : "hidden"}><div><label htmlFor={`spa-preview-primary-service-${index}`} className="block text-sm font-medium text-earth-700">服務</label><select id={`spa-preview-primary-service-${index}`} name={`guest-${index}-primary`} value={guest.primaryKey} onChange={(event) => updateActiveGuest(() => ({ primaryKey: event.target.value, addOnKeys: [] }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500">{primaryItems.map((item) => <option key={item.key} value={item.key}>{item.name}・{item.durationMinutes} 分</option>)}</select></div>{activePrimary.kind !== "COMBO" ? <fieldset><legend className="text-sm font-medium text-earth-700">加購</legend><div className="mt-2 grid gap-2">{addOnItems.map((item) => <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 px-3 py-2 text-sm"><span className="flex items-center gap-2"><input type="checkbox" name={`guest-${index}-addOn`} value={item.key} checked={guest.addOnKeys.includes(item.key)} onChange={() => toggleAddOn(item.key)} />{item.name}</span><span className="shrink-0 text-xs text-earth-500">＋{item.durationMinutes} 分</span></label>)}</div></fieldset> : null}</div>)}
        <div className="rounded-xl bg-primary-50 px-3.5 py-3 text-sm text-primary-800"><p className="font-semibold">{people} 位・NT${totalPrice.toLocaleString()}</p><div className="mt-2 space-y-1 text-xs">{guestSummaries.map((summary, index) => <p key={index}>第 {index + 1} 位・{summary.durationMinutes} 分鐘・{assignment[index]?.label ?? "此時段無法安排"}</p>)}</div></div>
        <button type="submit" disabled={isSubmitting || assignment.length !== people} className="min-h-11 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{isSubmitting ? "建立中…" : "建立整組預約"}</button>
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

function AlertItem({ title, detail, tone }: { title: string; detail: string; tone: "rose" | "sand" }) {
  return <div className="flex gap-3 rounded-xl bg-earth-50 p-3.5"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone === "rose" ? "bg-[#c78e7c]" : "bg-[#c5a66c]"}`} aria-hidden /><div><p className="text-sm font-semibold text-earth-900">{title}</p><p className="mt-1 text-xs text-earth-500">{detail}</p></div></div>;
}

function isAvailable(
  date: string,
  time: string,
  provider: PreviewProvider,
  serviceMinutes: number,
  bufferMinutes: number,
  bookings: readonly PreviewBooking[],
) {
  const bookingRanges = bookings
    .filter((booking) => booking.date === date && booking.providerId === provider.id)
    .map((booking) => ({
      date: booking.date,
      startTime: booking.time,
      durationMinutes: booking.durationMinutes + booking.bufferMinutes,
    }));
  const unavailableRanges = blockedRanges
    .filter((range) => range.date === date && range.providerId === provider.id)
    .map((range) => ({ date: range.date, startTime: range.startTime, durationMinutes: range.durationMinutes }));
  return isSpaProviderAvailable({
    provider: {
      id: provider.id,
      label: `${provider.badge}號 ${provider.name}`,
      specialties: provider.specialtyKeys,
      weeklyAvailability: provider.weeklyAvailability,
      availabilityExceptions: provider.scheduleExceptions.map((exception) => ({
        date: exception.date,
        type: exception.tone === "leave" ? "UNAVAILABLE" : "AVAILABLE",
        startTime: exception.startTime ?? null,
        endTime: exception.endTime ?? null,
      })),
      occupiedRanges: [...bookingRanges, ...unavailableRanges],
    },
    date,
    startTime: time,
    serviceMinutes,
    bufferMinutes,
  });
}

function toBookableProviders(
  providers: readonly PreviewProvider[],
  bookings: readonly PreviewBooking[],
): readonly SpaBookableProvider[] {
  return providers.map((provider) => ({
    id: provider.id,
    label: `${provider.badge}號 ${provider.name}`,
    specialties: provider.specialtyKeys,
    weeklyAvailability: provider.weeklyAvailability,
    availabilityExceptions: provider.scheduleExceptions.map((exception) => ({
      date: exception.date,
      type: exception.tone === "leave" ? "UNAVAILABLE" as const : "AVAILABLE" as const,
      startTime: exception.startTime ?? null,
      endTime: exception.endTime ?? null,
    })),
    occupiedRanges: [
      ...bookings.filter((booking) => booking.providerId === provider.id).map((booking) => ({ date: booking.date, startTime: booking.time, durationMinutes: booking.durationMinutes + booking.bufferMinutes })),
      ...blockedRanges.filter((range) => range.providerId === provider.id).map((range) => ({ date: range.date, startTime: range.startTime, durationMinutes: range.durationMinutes })),
    ],
  }));
}

function rowForTime(time: string) {
  const index = scheduleTimes.indexOf(time as (typeof scheduleTimes)[number]);
  return Math.max(index, 0) + 1;
}

function rowsForMinutes(minutes: number) {
  return Math.max(Math.ceil(minutes / 30), 1);
}
