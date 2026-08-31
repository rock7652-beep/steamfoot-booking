"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { completeSpaDemoBooking, completeSpaDemoGuestBooking } from "@/server/actions/spa-demo-checkout";
import { refundSpaDemoCheckout } from "@/server/actions/spa-demo-refund";
import { createSpaDemoCustomerBooking } from "@/server/actions/spa-demo-customer-booking";
import { cancelSpaDemoBooking } from "@/server/actions/spa-demo-booking-management";
import { adjustSpaDemoDailySettlement, confirmSpaDemoDailyReconciliation } from "@/server/actions/spa-demo-daily-reconciliation";
import type { SpaDemoDailyAdjustment, SpaDemoDailyRefund } from "@/server/queries/spa-demo-daily-reconciliation";
import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import {
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_PROVIDERS,
  type SpaDemoBooking as PreviewBooking,
  type SpaDemoBookingStatus as BookingStatus,
  type SpaDemoProvider as PreviewProvider,
  type SpaDemoTone as Tone,
  type SpaDemoBookingNotification,
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
import { buildSpaDailySummary, type SpaDailyGroup, type SpaDailySummary } from "@/lib/spa-daily-summary";
import { buildSpaAdvancedReport, type SpaAdvancedReport } from "@/lib/spa-advanced-report";
import {
  formatDateWithWeekdayZh,
  formatWeekdayZh,
  parseLocalDate,
  toDateInputValue,
} from "@/lib/date-utils";
import { SpaBookingNotificationCard } from "./spa-booking-notification-card";

type QuickSlot = {
  date: string;
  time: string;
  providerId: string;
};

type ScheduleDay = {
  key: string;
  shortLabel: string;
  weekday: string;
  today: boolean;
};

const baseScheduleDates = ["2026-08-28", "2026-08-29", "2026-08-30"] as const;

function buildScheduleDays(bookings: readonly PreviewBooking[], previewDate: string, selectedDate: string): readonly ScheduleDay[] {
  return [...new Set([...baseScheduleDates, previewDate, selectedDate, ...bookings.map((booking) => booking.date)])]
    .toSorted()
    .map((date) => {
      const [, month, day] = date.split("-").map(Number);
      return {
        key: date,
        shortLabel: `${month}/${day}`,
        weekday: formatWeekdayZh(date).replace("週", ""),
        today: date === previewDate,
      };
    });
}

function shiftScheduleDate(date: string, days: number): string {
  const shifted = parseLocalDate(date);
  shifted.setDate(shifted.getDate() + days);
  return toDateInputValue(shifted);
}

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
  initialNotification = null,
  initialReconciledDates = [],
  initialAdjustments = [],
  initialRefunds = [],
}: {
  initialProviders?: readonly PreviewProvider[];
  initialBookings?: readonly PreviewBooking[];
  previewDate?: string;
  initialNotification?: SpaDemoBookingNotification | null;
  initialReconciledDates?: readonly string[];
  initialAdjustments?: readonly SpaDemoDailyAdjustment[];
  initialRefunds?: readonly SpaDemoDailyRefund[];
}) {
  const industryModule = SPA_INDUSTRY_MODULE;
  const activeProviders = initialProviders;
  const getActiveProvider = (providerId: string) => (
    activeProviders.find((provider) => provider.id === providerId) ?? activeProviders[0]
  );
  const [bookings, setBookings] = useState<PreviewBooking[]>(() => [...initialBookings]);
  const [selectedDate, setSelectedDate] = useState(previewDate);
  const initialReportDates = initialBookings.map((booking) => booking.date).toSorted();
  const [reportDateFrom, setReportDateFrom] = useState(initialReportDates[0] ?? previewDate);
  const [reportDateTo, setReportDateTo] = useState(initialReportDates.at(-1) ?? previewDate);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedDailyGroupKey, setSelectedDailyGroupKey] = useState<string | null>(null);
  const [isDailyReconciliationOpen, setIsDailyReconciliationOpen] = useState(false);
  const [reconciledDates, setReconciledDates] = useState<ReadonlySet<string>>(() => new Set(initialReconciledDates));
  const [dailyAdjustments, setDailyAdjustments] = useState<SpaDemoDailyAdjustment[]>(() => [...initialAdjustments]);
  const [dailyRefunds, setDailyRefunds] = useState<SpaDemoDailyRefund[]>(() => [...initialRefunds]);
  const [quickSlot, setQuickSlot] = useState<QuickSlot | null>(null);
  const [notice, setNotice] = useState("點選預約可查看詳情，點選空白時段可快速新增。");
  const [notification, setNotification] = useState<SpaDemoBookingNotification | null>(initialNotification);
  const [isCompleting, startCompleting] = useTransition();

  const scheduleDays = useMemo(
    () => buildScheduleDays(bookings, previewDate, selectedDate),
    [bookings, previewDate, selectedDate],
  );
  const selectedDay = scheduleDays.find((day) => day.key === selectedDate) ?? scheduleDays[0];
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
  const dailySummary = useMemo(
    () => buildSpaDailySummary(dayBookings, activeProviders),
    [activeProviders, dayBookings],
  );
  const advancedReport = useMemo(
    () => buildSpaAdvancedReport(bookings, activeProviders, reportDateFrom, reportDateTo),
    [activeProviders, bookings, reportDateFrom, reportDateTo],
  );
  const selectedDailyGroup = dailySummary.groups.find((group) => group.key === selectedDailyGroupKey) ?? null;
  const isSelectedDayReconciled = reconciledDates.has(selectedDay.key);

  function chooseDay(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const nextDay = buildScheduleDays(bookings, previewDate, date).find((day) => day.key === date);
    if (!nextDay) return;
    setSelectedDate(date);
    setSelectedBookingId(null);
    setSelectedDailyGroupKey(null);
    setIsDailyReconciliationOpen(false);
    setQuickSlot(null);
    setNotice(`${nextDay.shortLabel}（${nextDay.weekday}）排程已顯示。`);
  }

  function markDateUnreconciled(date: string) {
    setReconciledDates((current) => {
      if (!current.has(date)) return current;
      const next = new Set(current);
      next.delete(date);
      return next;
    });
  }

  function confirmDailyReconciliation() {
    if (dailySummary.reconciliationStatus !== "READY") return;
    const date = selectedDay.key;
    startCompleting(async () => {
      const result = await confirmSpaDemoDailyReconciliation({ date });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setReconciledDates((current) => new Set(current).add(result.data.date));
      setNotice(`${formatDateWithWeekdayZh(result.data.date)}帳務已核對。`);
    });
  }

  function adjustDailySettlement(input: {
    bookingIds: readonly string[];
    settlement: "CASH" | "CREDIT_CARD";
    amount: number;
    reason: string;
  }) {
    const date = selectedDay.key;
    startCompleting(async () => {
      const result = await adjustSpaDemoDailySettlement({ date, ...input, bookingIds: [...input.bookingIds] });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setBookings((current) => current.map((booking) => (
        result.data.bookingIds.includes(booking.id)
          ? { ...booking, settlementLabel: result.data.afterMethod, settlementAmount: result.data.afterAmount, settlementScope: result.data.settlementScope }
          : booking
      )));
      markDateUnreconciled(result.data.date);
      setDailyAdjustments((current) => [result.data, ...current]);
      setNotice(`${result.data.customer} 的帳務已更正，請重新核對本日帳務。`);
    });
  }

  function openBooking(bookingId: string) {
    setSelectedBookingId(bookingId);
    setSelectedDailyGroupKey(null);
    setIsDailyReconciliationOpen(false);
    setQuickSlot(null);
    setNotice("已開啟預約詳情。");
  }

  function openQuickBooking(slot: QuickSlot) {
    setQuickSlot(slot);
    setSelectedBookingId(null);
    setSelectedDailyGroupKey(null);
    setIsDailyReconciliationOpen(false);
    setNotice(`正在安排 ${slot.time} 的預約。`);
  }

  function updateBookingStatus(bookingIds: readonly string[], status: BookingStatus, settlementLabel?: string, settlementAmount?: number, storedValueBalance?: number | null, packageRemainingSessions?: number | null) {
    if (!bookingIds.length) return;
    bookings.filter((booking) => bookingIds.includes(booking.id)).forEach((booking) => markDateUnreconciled(booking.date));
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

  function refundCheckout(scope: "GROUP" | "GUEST", bookingId: string, reason: string) {
    startCompleting(async () => {
      const result = await refundSpaDemoCheckout({ scope, bookingId, reason });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setBookings((current) => current.map((booking) => {
        const walletUpdates = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number]) ? {
          ...(result.data.storedValueBalance !== null ? { storedValueBalance: result.data.storedValueBalance } : {}),
          ...(result.data.packageRemainingSessions !== null ? { packageRemainingSessions: result.data.packageRemainingSessions } : {}),
        } : {};
        return result.data.bookingIds.includes(booking.id)
          ? { ...booking, ...walletUpdates, refundAmount: result.data.refunds.find((refund) => refund.bookingId === booking.id)?.amount ?? 0, refundReason: result.data.reason, refundedAt: result.data.refundedAt }
          : { ...booking, ...walletUpdates };
      }));
      markDateUnreconciled(result.data.date);
      setDailyRefunds((current) => [{
        date: result.data.date,
        bookingIds: result.data.bookingIds,
        customer: result.data.customer,
        time: result.data.time,
        scope: result.data.scope,
        settlements: result.data.settlements,
        refundAmount: result.data.refundAmount,
        reason: result.data.reason,
        refundedBy: result.data.refundedBy,
        refundedAt: result.data.refundedAt,
      }, ...current]);
      setNotice(`退款／作廢已完成${result.data.refundAmount ? `・NT$${result.data.refundAmount.toLocaleString()}` : "・療程次數已補回"}，請重新核對本日帳務。`);
    });
  }

  function requestRebooking() {
    if (!selectedBooking) return;
    const provider = getActiveProvider(selectedBooking.providerId);
    if (!provider) return;
    setNotice(`已準備為 ${selectedBooking.customer} 安排下一次；保留 ${provider.badge}號 ${provider.name}，日期與時間重新選擇。`);
  }

  function updateGroupBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBooking || !selectedGroupBookings.length) return;
    const formData = new FormData(event.currentTarget);
    const customer = String(formData.get("customer") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const bookingDate = String(formData.get("bookingDate") ?? selectedBooking.date);
    const slotTime = String(formData.get("slotTime") ?? selectedBooking.time);
    const guests = selectedGroupBookings
      .toSorted((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1))
      .map((_, index) => {
        const primaryKey = String(formData.get(`edit-guest-${index}-primary`) ?? "");
        const addOnKeys = formData.getAll(`edit-guest-${index}-addOn`).map(String);
        return { primaryKey, addOnKeys, items: composeSpaServices(primaryKey, addOnKeys) };
      });
    const providers = toBookableProviders(
      activeProviders,
      bookings.filter((booking) => !SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])),
    );
    const assignment = findSpaPartyProviderAssignment({ requests: guests.map((guest) => ({ items: guest.items })), providers, date: bookingDate, time: slotTime });
    if (!customer || !/^09\d{8}$/.test(phone)) {
      setNotice("請填寫主要聯絡人與正確手機號碼。");
      return;
    }
    if (assignment.length !== guests.length) {
      setNotice("修改後的時段無法同時安排全部服務。");
      return;
    }
    startCompleting(async () => {
      const result = await createSpaDemoCustomerBooking({
        bookingDate,
        slotTime,
        bookingSource: "MANAGER",
        bookingOperation: "UPDATE",
        primaryContact: { name: customer, phone },
        guests: guests.map((guest, index) => ({ providerId: assignment[index].id, primaryKey: guest.primaryKey, addOnKeys: guest.addOnKeys })),
      });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      const nextBookings: PreviewBooking[] = guests.map((guest, index) => {
        const summary = summarizeSpaServices(guest.items);
        return {
          id: SPA_DEMO_LIVE_FLOW_BOOKING_IDS[index], date: bookingDate, time: slotTime, customer,
          service: guest.items.map((item) => item.name.replace("加購", "")).join("＋"),
          serviceItems: guest.items.map((item) => item.name.replace("加購", "")), providerId: assignment[index].id,
          durationMinutes: summary.durationMinutes, bufferMinutes: 30, status: "已確認", tone: "sage", remainingSessions: null,
          note: "無", partySize: guests.length, guestIndex: index + 1, price: summary.price, contactPhone: phone,
          storedValueBalance: selectedBooking.storedValueBalance, packageRemainingSessions: selectedBooking.packageRemainingSessions,
        };
      });
      setBookings((current) => [...current.filter((booking) => !SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])), ...nextBookings]);
      setSelectedDate(bookingDate);
      markDateUnreconciled(selectedBooking.date);
      markDateUnreconciled(bookingDate);
      setSelectedBookingId(nextBookings[0].id);
      setNotification(result.data.notification);
      setNotice(`${customer} 共 ${guests.length} 位的預約已更新。`);
    });
  }

  function cancelBooking(scope: "GUEST" | "GROUP", bookingId: string) {
    selectedGroupBookings.forEach((booking) => markDateUnreconciled(booking.date));
    startCompleting(async () => {
      const result = await cancelSpaDemoBooking({ bookingId, scope });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setNotification(result.data.notification);
      if (result.data.cancelledAll) {
        setBookings((current) => current.filter((booking) => !SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])));
        setSelectedBookingId(null);
        setNotice("整組預約已取消。");
        return;
      }
      const survivors = selectedGroupBookings
        .toSorted((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1))
        .filter((booking) => booking.id !== bookingId)
        .map((booking, index, all) => ({ ...booking, id: SPA_DEMO_LIVE_FLOW_BOOKING_IDS[index], partySize: all.length, guestIndex: index + 1 }));
      setBookings((current) => [...current.filter((booking) => !SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])), ...survivors]);
      setSelectedBookingId(survivors[0]?.id ?? null);
      setNotice("此位預約已取消，其餘同行預約保留。");
    });
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
          contactPhone: phone,
          storedValueBalance: 5000,
          packageRemainingSessions: 5,
        };
      });
      setBookings((current) => [
        ...current.filter((booking) => !SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number])),
        ...nextBookings,
      ]);
      markDateUnreconciled(quickSlot.date);
      setSelectedBookingId(nextBookings[0].id);
      setQuickSlot(null);
      setNotification(result.data.notification);
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

          <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="當日營運摘要">
            <MetricCard label="預約人次" value={String(dailySummary.bookingCount)} unit="位" detail={`${dailySummary.groups.length} 組預約`} />
            <MetricCard label="已完成" value={String(dailySummary.completedCount)} unit="位" detail={newCustomerCount ? `含 ${newCustomerCount} 位新客` : "服務完成即列入"} />
            <MetricCard label="當日實收" value={`NT$${dailySummary.paidAmount.toLocaleString()}`} unit="" detail="整組付款只計算一次" emphasized />
            <MetricCard label="待服務" value={String(activeCount)} unit="位" detail={activeCount ? "點預約即可完成結帳" : "當日服務已完成"} />
          </section>

          <DailyOperationsSection
            summary={dailySummary}
            date={selectedDay.key}
            isReconciled={isSelectedDayReconciled}
            onOpenGroup={(key) => {
              setSelectedBookingId(null);
              setQuickSlot(null);
              setIsDailyReconciliationOpen(false);
              setSelectedDailyGroupKey(key);
            }}
            onOpenReconciliation={() => {
              setSelectedBookingId(null);
              setQuickSlot(null);
              setSelectedDailyGroupKey(null);
              setIsDailyReconciliationOpen(true);
            }}
          />

          <AdvancedOperationsReport
            report={advancedReport}
            dateFrom={reportDateFrom}
            dateTo={reportDateTo}
            onDateFromChange={(date) => { if (date <= reportDateTo) setReportDateFrom(date); }}
            onDateToChange={(date) => { if (date >= reportDateFrom) setReportDateTo(date); }}
          />

          <div className="mt-6 grid min-w-0 gap-6">
            <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70">
              <div className="flex flex-col gap-4 border-b border-earth-100 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">時間 × 芳療師</h2>
                </div>
                <DateSelector selectedDate={selectedDay.key} onChooseDay={chooseDay} />
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
              {notification ? <div className="mb-4"><SpaBookingNotificationCard notification={notification} /></div> : null}
              <section className="rounded-2xl bg-white p-5 shadow-[0_8px_24px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70">
                <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">今日提醒</h2><span className="rounded-full bg-earth-100 px-2 py-1 text-xs text-earth-500">2 項</span></div>
                <div className="mt-4 space-y-3"><AlertItem title="新客首次到店" detail="服務前確認注意事項" tone="rose" /><AlertItem title="療程即將到期" detail="完成服務後提醒續購" tone="sand" /></div>
              </section>
            </aside>
          </div>
        </main>
      </div>

      {quickSlot || selectedBooking || selectedDailyGroup || isDailyReconciliationOpen ? (
        <div className="fixed inset-0 z-50 bg-black/25" onClick={() => { setQuickSlot(null); setSelectedBookingId(null); setSelectedDailyGroupKey(null); setIsDailyReconciliationOpen(false); }}>
          <aside className="ml-auto h-full w-full max-w-[430px] overflow-y-auto bg-[#f7f5f0] p-5 shadow-2xl" aria-label={isDailyReconciliationOpen ? "每日帳務核對右側面板" : selectedDailyGroup ? "每日帳務右側明細面板" : "預約右側操作面板"} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-earth-700">{isDailyReconciliationOpen ? "每日帳務核對" : selectedDailyGroup ? "帳務明細" : "預約操作"}</p>
              <button type="button" onClick={() => { setQuickSlot(null); setSelectedBookingId(null); setSelectedDailyGroupKey(null); setIsDailyReconciliationOpen(false); }} className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-600">關閉</button>
            </div>
            {isDailyReconciliationOpen ? (
              <DailyReconciliationDetail
                date={selectedDay.key}
                summary={dailySummary}
                bookings={dayBookings}
                isReconciled={isSelectedDayReconciled}
                onConfirm={confirmDailyReconciliation}
                onAdjust={adjustDailySettlement}
                isConfirming={isCompleting}
                adjustments={dailyAdjustments.filter((adjustment) => adjustment.date === selectedDay.key)}
                refunds={dailyRefunds.filter((refund) => refund.date === selectedDay.key)}
              />
            ) : selectedDailyGroup ? (
              <DailyGroupDetail
                group={selectedDailyGroup}
                bookings={dayBookings.filter((booking) => selectedDailyGroup.bookingIds.includes(booking.id))}
                providers={activeProviders}
              />
            ) : quickSlot ? (
            <QuickBookingForm providers={toBookableProviders(activeProviders, bookings)} slot={quickSlot} onCancel={() => setQuickSlot(null)} onSubmit={createQuickBooking} isSubmitting={isCompleting} />
            ) : selectedBooking ? (
              <BookingDetail key={selectedGroupBookings.map((booking) => `${booking.id}:${booking.refundedAt ?? ""}`).join("|")} scheduleDays={scheduleDays} providers={activeProviders} bookableProviders={toBookableProviders(activeProviders, bookings.filter((item) => !selectedGroupBookings.some((selected) => selected.id === item.id)))} bookings={selectedGroupBookings} booking={selectedBooking} onCompleteGroup={completeBooking} onCompleteGuest={completeGuestBooking} onRefund={refundCheckout} onUpdate={updateGroupBooking} onCancel={cancelBooking} isCompleting={isCompleting} onRebook={requestRebooking} />
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function DateSelector({ selectedDate, onChooseDay }: { selectedDate: string; onChooseDay: (date: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="選擇排程日期">
      <button type="button" onClick={() => onChooseDay(shiftScheduleDate(selectedDate, -1))} className="min-h-10 shrink-0 rounded-lg border border-earth-200 bg-earth-50 px-3 text-earth-600">前一天</button>
      <input
        type="date"
        aria-label="查詢日期"
        value={selectedDate}
        onChange={(event) => onChooseDay(event.target.value)}
        className="min-h-10 rounded-lg border border-earth-200 bg-white px-3 font-semibold text-earth-700"
      />
      <button type="button" onClick={() => onChooseDay(shiftScheduleDate(selectedDate, 1))} className="min-h-10 shrink-0 rounded-lg border border-earth-200 bg-earth-50 px-3 text-earth-600">後一天</button>
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

function BookingDetail({ scheduleDays, providers, bookableProviders, bookings, booking, onCompleteGroup, onCompleteGuest, onRefund, onUpdate, onCancel, isCompleting, onRebook }: { scheduleDays: readonly ScheduleDay[]; providers: readonly PreviewProvider[]; bookableProviders: readonly SpaBookableProvider[]; bookings: readonly PreviewBooking[]; booking: PreviewBooking; onCompleteGroup: (settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") => void; onCompleteGuest: (bookingId: string, settlement: "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE") => void; onRefund: (scope: "GROUP" | "GUEST", bookingId: string, reason: string) => void; onUpdate: (event: FormEvent<HTMLFormElement>) => void; onCancel: (scope: "GUEST" | "GROUP", bookingId: string) => void; isCompleting: boolean; onRebook: () => void }) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ scope: "GUEST" | "GROUP"; bookingId: string } | null>(null);
  const [showRefund, setShowRefund] = useState(false);
  const [refundTargetId, setRefundTargetId] = useState(booking.id);
  const [checkoutMode, setCheckoutMode] = useState<"GROUP" | "SPLIT">("GROUP");
  const [settlement, setSettlement] = useState<"CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE">(booking.remainingSessions === null ? "CASH" : "PACKAGE");
  const [guestSettlements, setGuestSettlements] = useState<Record<string, "CASH" | "CREDIT_CARD" | "STORED_VALUE" | "PACKAGE">>(() => Object.fromEntries(bookings.map((item) => [item.id, "CASH"])));
  const orderedBookings = [...bookings].sort((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
  const people = Math.max(bookings.length, booking.partySize ?? 1);
  const completedCount = bookings.filter((item) => item.status === "已完成").length;
  const allCompleted = completedCount === people;
  const refundableBookings = orderedBookings.filter((item) => item.status === "已完成" && !item.refundedAt);
  const allRefunded = allCompleted && refundableBookings.length === 0;
  const someCompleted = completedCount > 0 && !allCompleted;
  const isLiveGroup = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(booking.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number]);
  const expectedAmount = bookings.reduce((total, item) => total + (item.price ?? 0), 0);
  const settlementOptions = [
    ["CASH", "現金"],
    ["CREDIT_CARD", "刷卡"],
    ["STORED_VALUE", "主要聯絡人儲值金"],
    ["PACKAGE", checkoutMode === "GROUP" ? `主要聯絡人療程 ${people} 次` : "主要聯絡人療程 1 次"],
  ] as const;
  if (showEdit) {
    return <BookingEditForm scheduleDays={scheduleDays} booking={booking} bookings={orderedBookings} providers={bookableProviders} onSubmit={onUpdate} onCancel={() => setShowEdit(false)} isSubmitting={isCompleting} />;
  }
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
              {!someCompleted && !allCompleted ? <button type="button" onClick={() => setCancelTarget({ scope: "GUEST", bookingId: item.id })} className="mt-3 text-xs font-semibold text-earth-300 underline underline-offset-4">取消此位</button> : null}
              {item.status === "已完成" ? <p className="mt-3 rounded-xl bg-primary-100 px-3 py-2 text-xs font-semibold text-primary-900">{item.refundedAt ? `已退款${item.refundAmount ? `・NT$${item.refundAmount.toLocaleString()}` : "・療程已補回"}` : `已結帳・${item.settlementLabel ?? "完成"}`}</p> : showCheckout && (checkoutMode === "SPLIT" || someCompleted) ? (
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
      {cancelTarget ? <div className="mt-5 rounded-2xl bg-[#624238] p-4"><p className="text-sm font-semibold">{cancelTarget.scope === "GROUP" ? "確定取消整組預約？" : "確定取消此位預約？"}</p><div className="mt-3 grid grid-cols-2 gap-2"><ActionButton label="返回" onClick={() => setCancelTarget(null)} disabled={isCompleting} /><ActionButton label={isCompleting ? "處理中…" : "確認取消"} onClick={() => onCancel(cancelTarget.scope, cancelTarget.bookingId)} disabled={isCompleting} emphasized /></div></div> : null}
      {showRefund ? (
        <form className="mt-5 rounded-2xl bg-[#624238] p-4" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim(); if (reason.length < 2) return; const scope = refundTargetId === "GROUP" ? "GROUP" : "GUEST"; onRefund(scope, scope === "GROUP" ? booking.id : refundTargetId, reason); setShowRefund(false); }}>
          <p className="text-sm font-semibold">退款／作廢</p>
          <div className="mt-3 grid gap-2">
            {refundableBookings.length === orderedBookings.length && orderedBookings.length > 1 ? <label className="flex min-h-10 items-center gap-2 rounded-xl bg-white/8 px-3 text-xs"><input type="radio" name="refundTarget" checked={refundTargetId === "GROUP"} onChange={() => setRefundTargetId("GROUP")} />整組退款</label> : null}
            {refundableBookings.map((item) => <label key={item.id} className="flex min-h-10 items-center gap-2 rounded-xl bg-white/8 px-3 text-xs"><input type="radio" name="refundTarget" checked={refundTargetId === item.id} onChange={() => setRefundTargetId(item.id)} />第 {item.guestIndex ?? 1} 位・{item.service}</label>)}
          </div>
          <label className="mt-3 block text-xs text-earth-200">原因<input name="reason" required minLength={2} maxLength={80} placeholder="例如：顧客臨時取消付款" className="mt-1 min-h-10 w-full rounded-lg border-0 bg-white px-3 text-earth-900" /></label>
          <div className="mt-3 grid grid-cols-2 gap-2"><ActionButton label="返回" onClick={() => setShowRefund(false)} disabled={isCompleting} /><button type="submit" disabled={isCompleting} className="min-h-11 rounded-xl bg-primary-200 px-3 text-xs font-semibold text-primary-900 disabled:opacity-35">{isCompleting ? "處理中…" : "確認退款"}</button></div>
        </form>
      ) : null}
      {allCompleted ? (
        <div className="mt-5 grid gap-2"><div className="rounded-xl bg-primary-100 px-4 py-3 text-sm font-semibold text-primary-900">{allRefunded ? "此組結帳已退款" : "整組服務已完成"}</div>{!showRefund && refundableBookings.length ? <ActionButton label="退款／作廢" onClick={() => { setRefundTargetId(refundableBookings.length === orderedBookings.length && orderedBookings.length > 1 ? "GROUP" : refundableBookings[0].id); setShowRefund(true); }} /> : null}<ActionButton label="再約下一次" onClick={onRebook} /></div>
      ) : showCheckout ? (
        <div className="mt-5 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
          {!someCompleted && people > 1 ? <div className="grid grid-cols-2 gap-2"><ActionButton label="整組付款" onClick={() => setCheckoutMode("GROUP")} emphasized={checkoutMode === "GROUP"} /><ActionButton label="分開付款" onClick={() => setCheckoutMode("SPLIT")} emphasized={checkoutMode === "SPLIT"} /></div> : null}
          {checkoutMode === "GROUP" && !someCompleted ? <><p className="mt-4 text-sm font-semibold">整組完成與結帳</p><div className="mt-3 grid grid-cols-2 gap-2">{settlementOptions.map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm ring-1 ${settlement === value ? "bg-primary-100 text-primary-900 ring-primary-200" : "bg-white/5 text-white ring-white/15"}`}><input type="radio" name="spa-demo-settlement" value={value} checked={settlement === value} onChange={() => setSettlement(value)} />{label}</label>)}</div><div className="mt-3"><ActionButton label={isCompleting ? "處理中…" : "整組完成並結帳"} onClick={() => onCompleteGroup(settlement)} disabled={isCompleting} emphasized /></div></> : null}
          <div className="mt-3"><ActionButton label="返回" onClick={() => setShowCheckout(false)} disabled={isCompleting} /></div>
        </div>
      ) : (
        <div className="mt-5 grid gap-2"><ActionButton label="完成服務與結帳" onClick={() => { setCheckoutMode(someCompleted ? "SPLIT" : "GROUP"); setShowCheckout(true); }} emphasized />{!someCompleted ? <><ActionButton label="修改預約" onClick={() => setShowEdit(true)} /><ActionButton label="取消整組" onClick={() => setCancelTarget({ scope: "GROUP", bookingId: booking.id })} /></> : null}<ActionButton label="再約下一次" onClick={onRebook} /></div>
      )}
    </section>
  );
}

function selectionFromBooking(booking: PreviewBooking): QuickGuestSelection {
  const primary = SPA_SERVICE_MENU.find((item) => item.kind !== "ADD_ON" && booking.service.includes(item.name));
  const addOnKeys = SPA_SERVICE_MENU
    .filter((item) => item.kind === "ADD_ON" && booking.service.includes(item.name.replace("加購", "")))
    .map((item) => item.key);
  return { primaryKey: primary?.key ?? "aroma_body_60", addOnKeys };
}

function BookingEditForm({ scheduleDays, booking, bookings, providers, onSubmit, onCancel, isSubmitting }: { scheduleDays: readonly ScheduleDay[]; booking: PreviewBooking; bookings: readonly PreviewBooking[]; providers: readonly SpaBookableProvider[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; isSubmitting: boolean }) {
  const [guests, setGuests] = useState<readonly QuickGuestSelection[]>(() => bookings.map(selectionFromBooking));
  const [activeGuestIndex, setActiveGuestIndex] = useState(0);
  const [bookingDate, setBookingDate] = useState(booking.date);
  const [slotTime, setSlotTime] = useState(booking.time);
  const primaryItems = SPA_SERVICE_MENU.filter((item) => item.kind !== "ADD_ON");
  const addOnItems = SPA_SERVICE_MENU.filter((item) => item.kind === "ADD_ON");
  const guestItems = guests.map((guest) => composeSpaServices(guest.primaryKey, guest.addOnKeys));
  const summaries = guestItems.map(summarizeSpaServices);
  const assignment = findSpaPartyProviderAssignment({ requests: guestItems.map((items) => ({ items })), providers, date: bookingDate, time: slotTime });
  const totalPrice = summaries.reduce((total, summary) => total + summary.price, 0);

  function updateGuest(index: number, update: (guest: QuickGuestSelection) => QuickGuestSelection) {
    setGuests((current) => current.map((guest, guestIndex) => guestIndex === index ? update(guest) : guest));
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">修改預約</h2><button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-earth-500 hover:bg-earth-100">返回</button></div>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-2"><div><label htmlFor="spa-edit-customer" className="block text-sm font-medium text-earth-700">主要聯絡人</label><input id="spa-edit-customer" name="customer" required defaultValue={booking.customer} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3" /></div><div><label htmlFor="spa-edit-phone" className="block text-sm font-medium text-earth-700">電話</label><input id="spa-edit-phone" name="phone" required inputMode="tel" pattern="09[0-9]{8}" defaultValue={booking.contactPhone ?? ""} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3" /></div></div>
        <div className="grid grid-cols-2 gap-2"><div><label htmlFor="spa-edit-date" className="block text-sm font-medium text-earth-700">日期</label><select id="spa-edit-date" name="bookingDate" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3">{scheduleDays.map((day) => <option key={day.key} value={day.key}>{day.shortLabel}（{day.weekday}）</option>)}</select></div><div><label htmlFor="spa-edit-time" className="block text-sm font-medium text-earth-700">時間</label><select id="spa-edit-time" name="slotTime" value={slotTime} onChange={(event) => setSlotTime(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3">{scheduleTimes.map((time) => <option key={time} value={time}>{time}</option>)}</select></div></div>
        <div className="flex gap-2">{guests.map((_, index) => <button key={index} type="button" onClick={() => setActiveGuestIndex(index)} className={`min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold ring-1 ${activeGuestIndex === index ? "bg-primary-100 text-primary-900 ring-primary-200" : "bg-white text-earth-600 ring-earth-200"}`}>{index === 0 ? "第 1 位" : `第 ${index + 1} 位`}</button>)}</div>
        {guests.map((guest, index) => <div key={index} className={activeGuestIndex === index ? "space-y-4" : "hidden"}><div><label htmlFor={`spa-edit-primary-${index}`} className="block text-sm font-medium text-earth-700">服務</label><select id={`spa-edit-primary-${index}`} name={`edit-guest-${index}-primary`} value={guest.primaryKey} onChange={(event) => updateGuest(index, () => ({ primaryKey: event.target.value, addOnKeys: [] }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3">{primaryItems.map((item) => <option key={item.key} value={item.key}>{item.name}・{item.durationMinutes} 分</option>)}</select></div>{SPA_SERVICE_MENU.find((item) => item.key === guest.primaryKey)?.kind !== "COMBO" ? <fieldset><legend className="text-sm font-medium text-earth-700">加購</legend><div className="mt-2 grid gap-2">{addOnItems.map((item) => <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 px-3 py-2 text-sm"><span className="flex items-center gap-2"><input type="checkbox" name={`edit-guest-${index}-addOn`} value={item.key} checked={guest.addOnKeys.includes(item.key)} onChange={() => updateGuest(index, (current) => ({ ...current, addOnKeys: current.addOnKeys.includes(item.key) ? current.addOnKeys.filter((key) => key !== item.key) : [...current.addOnKeys, item.key] }))} />{item.name}</span><span className="text-xs text-earth-500">＋{item.durationMinutes} 分</span></label>)}</div></fieldset> : null}</div>)}
        <div className="rounded-xl bg-primary-50 p-3.5 text-sm text-primary-900"><p className="font-semibold">{guests.length} 位・NT${totalPrice.toLocaleString()}</p><div className="mt-2 space-y-1 text-xs">{summaries.map((summary, index) => <p key={index}>第 {index + 1} 位・{summary.durationMinutes} 分鐘・{assignment[index]?.label ?? "此時段無法安排"}</p>)}</div></div>
        <button type="submit" disabled={isSubmitting || assignment.length !== guests.length} className="min-h-11 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white disabled:opacity-35">{isSubmitting ? "更新中…" : "儲存修改"}</button>
      </form>
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
        {guests.map((guest, index) => <div key={index} className={index === activeGuestIndex ? "space-y-4" : "hidden"}><div><label htmlFor={`spa-preview-primary-service-${index}`} className="block text-sm font-medium text-earth-700">服務</label><select id={`spa-preview-primary-service-${index}`} name={`guest-${index}-primary`} value={guest.primaryKey} onChange={(event) => updateActiveGuest(() => ({ primaryKey: event.target.value, addOnKeys: [] }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500">{primaryItems.map((item) => <option key={item.key} value={item.key}>{item.name}・{item.durationMinutes} 分</option>)}</select></div>{SPA_SERVICE_MENU.find((item) => item.key === guest.primaryKey)?.kind !== "COMBO" ? <fieldset><legend className="text-sm font-medium text-earth-700">加購</legend><div className="mt-2 grid gap-2">{addOnItems.map((item) => <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 px-3 py-2 text-sm"><span className="flex items-center gap-2"><input type="checkbox" name={`guest-${index}-addOn`} value={item.key} checked={guest.addOnKeys.includes(item.key)} onChange={() => toggleAddOn(item.key)} />{item.name}</span><span className="shrink-0 text-xs text-earth-500">＋{item.durationMinutes} 分</span></label>)}</div></fieldset> : null}</div>)}
        <div className="rounded-xl bg-primary-50 px-3.5 py-3 text-sm text-primary-800"><p className="font-semibold">{people} 位・NT${totalPrice.toLocaleString()}</p><div className="mt-2 space-y-1 text-xs">{guestSummaries.map((summary, index) => <p key={index}>第 {index + 1} 位・{summary.durationMinutes} 分鐘・{assignment[index]?.label ?? "此時段無法安排"}</p>)}</div></div>
        <button type="submit" disabled={isSubmitting || assignment.length !== people} className="min-h-11 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{isSubmitting ? "建立中…" : "建立整組預約"}</button>
      </form>
    </section>
  );
}

function AdvancedOperationsReport({ report, dateFrom, dateTo, onDateFromChange, onDateToChange }: {
  report: SpaAdvancedReport;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70" aria-label="期間營運與技師業績報表">
      <div className="flex flex-col gap-3 border-b border-earth-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">營運報表</h2>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
          <input type="date" aria-label="報表開始日期" value={dateFrom} max={dateTo} onChange={(event) => onDateFromChange(event.target.value)} className="min-h-10 rounded-lg border border-earth-200 bg-white px-2 text-earth-700" />
          <span className="text-earth-400">至</span>
          <input type="date" aria-label="報表結束日期" value={dateTo} min={dateFrom} onChange={(event) => onDateToChange(event.target.value)} className="min-h-10 rounded-lg border border-earth-200 bg-white px-2 text-earth-700" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-earth-100 lg:grid-cols-5">
        <ReportMetric label="預約組數" value={`${report.bookingGroups}`} unit="組" />
        <ReportMetric label="完成服務" value={`${report.completedServices}`} unit="位" />
        <ReportMetric label="原收款" value={`NT$${report.grossReceived.toLocaleString()}`} />
        <ReportMetric label="退款" value={`NT$${report.refundAmount.toLocaleString()}`} negative={report.refundAmount > 0} />
        <ReportMetric label="淨收入" value={`NT$${report.netReceived.toLocaleString()}`} emphasized />
      </div>
      <div className="grid lg:grid-cols-2">
        <div className="border-b border-earth-100 p-5 lg:border-b-0 lg:border-r">
          <h3 className="font-semibold">芳療師業績與抽成</h3>
          <div className="mt-3 divide-y divide-earth-100">
            {report.providers.length ? report.providers.map((provider) => (
              <div key={provider.providerId} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold text-earth-900">{provider.label}</p><p className="mt-1 text-xs text-earth-500">完成 {provider.completedServices} 位{provider.refundedServices ? `・退款 ${provider.refundedServices} 位` : ""}・{provider.compensationLabel}</p></div>
                  <div className="text-right"><p className="font-semibold tabular-nums text-earth-900">NT${provider.netServiceAmount.toLocaleString()}</p><p className="mt-1 text-xs text-earth-500">抽成 {provider.compensationAmount === null ? "尚未設定" : `NT$${provider.compensationAmount.toLocaleString()}`}</p></div>
                </div>
              </div>
            )) : <p className="py-6 text-sm text-earth-500">此期間尚無完成服務</p>}
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-semibold">服務項目</h3>
          <div className="mt-3 divide-y divide-earth-100">
            {report.services.length ? report.services.slice(0, 6).map((service) => (
              <div key={service.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div><p className="font-medium text-earth-800">{service.name}</p><p className="mt-1 text-xs text-earth-500">完成 {service.completedCount} 次{service.refundedCount ? `・退款 ${service.refundedCount} 次` : ""}</p></div>
                <span className="font-semibold tabular-nums text-earth-900">NT${service.serviceAmount.toLocaleString()}</span>
              </div>
            )) : <p className="py-6 text-sm text-earth-500">此期間尚無服務資料</p>}
          </div>
          <div className="mt-4 flex justify-between border-t border-earth-100 pt-4 text-sm"><span className="text-earth-500">平均每組淨收</span><span className="font-semibold tabular-nums text-earth-900">NT${report.averageGroupSpend.toLocaleString()}</span></div>
        </div>
      </div>
    </section>
  );
}

function ReportMetric({ label, value, unit, emphasized = false, negative = false }: { label: string; value: string; unit?: string; emphasized?: boolean; negative?: boolean }) {
  return <div className={`${emphasized ? "bg-primary-50" : "bg-white"} px-4 py-4`}><p className="text-xs text-earth-500">{label}</p><p className={`mt-1.5 text-lg font-semibold tabular-nums ${negative ? "text-[#855649]" : "text-earth-900"}`}>{value}{unit ? <span className="ml-1 text-xs font-medium text-earth-500">{unit}</span> : null}</p></div>;
}

function DailyOperationsSection({
  summary,
  date,
  isReconciled,
  onOpenGroup,
  onOpenReconciliation,
}: {
  summary: SpaDailySummary;
  date: string;
  isReconciled: boolean;
  onOpenGroup: (key: string) => void;
  onOpenReconciliation: () => void;
}) {
  const reconciliationLabel = isReconciled
    ? "已核對"
    : summary.reconciliationStatus === "READY"
      ? "待核對"
      : summary.reconciliationStatus === "PENDING"
        ? "尚未完成"
        : "無需核對";
  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70" aria-label="每日營運與帳務總覽">
      <div className="flex items-center justify-between gap-3 border-b border-earth-100 px-5 py-5">
        <div>
          <h2 className="text-lg font-semibold">每日營運與帳務</h2>
          <p className="mt-1 text-sm text-earth-500">{formatDateWithWeekdayZh(date)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isReconciled ? "bg-primary-100 text-primary-800" : "bg-earth-100 text-earth-600"}`}>{reconciliationLabel}</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <div className="border-b border-earth-100 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">預約與結帳明細</h3>
            <span className="text-sm text-earth-500">{summary.groups.length} 組</span>
          </div>
          <div className="mt-3 divide-y divide-earth-100">
            {summary.groups.length ? summary.groups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => onOpenGroup(group.key)}
                className="flex w-full items-center justify-between gap-4 py-3.5 text-left transition hover:bg-earth-50"
                aria-label={`查看 ${group.time} ${group.customer} 帳務明細`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-earth-900">{group.time}・{group.customer}・{group.people} 位</span>
                  <span className="mt-1 block text-xs text-earth-500">{group.completedCount}/{group.people} 完成・{group.checkoutMode}・{group.paymentSummary}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums text-earth-900">NT${group.paidAmount.toLocaleString()}</span>
                  <span className="mt-1 block text-xs text-earth-400">查看 ›</span>
                </span>
              </button>
            )) : <p className="py-6 text-center text-sm text-earth-500">這一天尚無預約</p>}
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-semibold">付款方式</h3>
          <div className="mt-3 divide-y divide-earth-100">
            {summary.payments.length ? summary.payments.map((payment) => (
              <div key={payment.method} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-earth-600">{payment.method}・{payment.count} 筆</span>
                <span className="font-semibold tabular-nums text-earth-900">NT${payment.amount.toLocaleString()}</span>
              </div>
            )) : <p className="py-4 text-sm text-earth-500">尚無完成結帳</p>}
          </div>
          {summary.refundAmount > 0 ? <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f7ece8] px-3 py-2.5 text-sm text-[#855649]"><span>退款／作廢</span><span className="font-semibold tabular-nums">－NT${summary.refundAmount.toLocaleString()}</span></div> : null}
          <div className="mt-4 border-t border-earth-100 pt-4">
            <h3 className="font-semibold">芳療師完成服務</h3>
            <div className="mt-2 space-y-2">
              {summary.providerPerformance.length ? summary.providerPerformance.map((provider) => (
                <div key={provider.providerId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-earth-600">{provider.label}・{provider.completedServices} 位</span>
                  <span className="font-semibold tabular-nums text-earth-900">NT${provider.serviceAmount.toLocaleString()}</span>
                </div>
              )) : <p className="text-sm text-earth-500">尚無完成服務</p>}
            </div>
          </div>
          <div className="mt-4 border-t border-earth-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">帳務核對</h3>
                <p className="mt-1 text-xs text-earth-500">{reconciliationLabel}</p>
              </div>
              <button type="button" onClick={onOpenReconciliation} className="min-h-10 rounded-xl border border-earth-200 bg-white px-3 text-sm font-semibold text-earth-700">查看／核對</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type DailyAdjustmentTarget = {
  key: string;
  bookingIds: readonly string[];
  customer: string;
  label: string;
  settlement: "CASH" | "CREDIT_CARD";
  amount: number;
};

function buildDailyAdjustmentTargets(summary: SpaDailySummary, bookings: readonly PreviewBooking[]): DailyAdjustmentTarget[] {
  return summary.groups.flatMap((group) => {
    const allCompleted = bookings
      .filter((booking) => group.bookingIds.includes(booking.id) && booking.status === "已完成")
      .toSorted((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
    if (group.checkoutMode === "整組付款" && allCompleted.some((booking) => booking.refundedAt)) return [];
    const ordered = allCompleted.filter((booking) => !booking.refundedAt);
    if (!ordered.length) return [];
    const firstMethod = ordered[0].settlementLabel === "現金"
      ? "CASH" as const
      : ordered[0].settlementLabel === "刷卡"
        ? "CREDIT_CARD" as const
        : null;
    if (group.checkoutMode === "整組付款" && firstMethod && ordered.every((booking) => booking.settlementLabel === ordered[0].settlementLabel)) {
      return [{
        key: group.key,
        bookingIds: ordered.map((booking) => booking.id),
        customer: group.customer,
        label: `${group.time}・${group.customer}・整組付款`,
        settlement: firstMethod,
        amount: group.paidAmount,
      }];
    }
    return ordered.flatMap((booking) => {
      const settlement = booking.settlementLabel === "現金"
        ? "CASH" as const
        : booking.settlementLabel === "刷卡"
          ? "CREDIT_CARD" as const
          : null;
      if (!settlement || !booking.settlementAmount) return [];
      return [{
        key: booking.id,
        bookingIds: [booking.id],
        customer: booking.customer,
        label: `${booking.time}・${booking.customer}・第 ${booking.guestIndex ?? 1} 位`,
        settlement,
        amount: booking.settlementAmount,
      }];
    });
  });
}

function DailyReconciliationDetail({
  date,
  summary,
  bookings,
  isReconciled,
  onConfirm,
  onAdjust,
  isConfirming,
  adjustments,
  refunds,
}: {
  date: string;
  summary: SpaDailySummary;
  bookings: readonly PreviewBooking[];
  isReconciled: boolean;
  onConfirm: () => void;
  onAdjust: (input: { bookingIds: readonly string[]; settlement: "CASH" | "CREDIT_CARD"; amount: number; reason: string }) => void;
  isConfirming: boolean;
  adjustments: readonly SpaDemoDailyAdjustment[];
  refunds: readonly SpaDemoDailyRefund[];
}) {
  const [editingTargetKey, setEditingTargetKey] = useState<string | null>(null);
  const adjustmentTargets = buildDailyAdjustmentTargets(summary, bookings);
  const editingTarget = adjustmentTargets.find((target) => target.key === editingTargetKey) ?? null;

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTarget) return;
    const formData = new FormData(event.currentTarget);
    const settlement = String(formData.get("settlement"));
    const amount = Number(formData.get("amount"));
    const reason = String(formData.get("reason") ?? "").trim();
    if ((settlement !== "CASH" && settlement !== "CREDIT_CARD") || !Number.isInteger(amount) || amount <= 0 || reason.length < 2) return;
    onAdjust({ bookingIds: editingTarget.bookingIds, settlement, amount, reason });
    setEditingTargetKey(null);
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
      <p className="text-xs text-earth-500">{formatDateWithWeekdayZh(date)}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-earth-900">每日結帳核對</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isReconciled ? "bg-primary-100 text-primary-800" : "bg-earth-100 text-earth-600"}`}>
          {isReconciled ? "已核對" : summary.reconciliationStatus === "READY" ? "待核對" : summary.reconciliationStatus === "PENDING" ? "尚未完成" : "無需核對"}
        </span>
      </div>

      <div className="mt-5 divide-y divide-earth-100 border-y border-earth-100 text-sm">
        <div className="flex justify-between gap-3 py-3"><span className="text-earth-500">預約人次</span><span className="font-semibold">{summary.bookingCount} 位</span></div>
        <div className="flex justify-between gap-3 py-3"><span className="text-earth-500">完成服務</span><span className="font-semibold">{summary.completedCount} 位</span></div>
        <div className="flex justify-between gap-3 py-3"><span className="text-earth-500">服務總額</span><span className="font-semibold tabular-nums">NT${summary.expectedAmount.toLocaleString()}</span></div>
        <div className="flex justify-between gap-3 py-3"><span className="text-earth-500">原收款</span><span className="font-semibold tabular-nums">NT${summary.grossPaidAmount.toLocaleString()}</span></div>
        {summary.refundAmount > 0 ? <div className="flex justify-between gap-3 py-3 text-[#855649]"><span>退款／作廢</span><span className="font-semibold tabular-nums">－NT${summary.refundAmount.toLocaleString()}</span></div> : null}
        <div className="flex justify-between gap-3 py-3"><span className="font-semibold text-earth-800">當日淨收</span><span className="font-semibold tabular-nums">NT${summary.paidAmount.toLocaleString()}</span></div>
      </div>

      {summary.payments.length ? (
        <div className="mt-4">
          <h3 className="font-semibold">付款方式</h3>
          <div className="mt-2 space-y-2 text-sm">
            {summary.payments.map((payment) => (
              <div key={payment.method} className="flex justify-between gap-3">
                <span className="text-earth-500">{payment.method}・{payment.count} 筆</span>
                <span className="font-semibold tabular-nums">NT${payment.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {summary.reconciliationStatus === "PENDING" ? (
        <div className="mt-5 rounded-xl bg-[#f6f0e5] px-3.5 py-3 text-sm text-[#765f38]">
          {summary.unsettledGroupCount ? `${summary.unsettledGroupCount} 組尚未完成結帳` : `${summary.unrecordedPaymentCount} 組付款方式未記錄`}
        </div>
      ) : null}

      {adjustmentTargets.length ? (
        <div className="mt-5 border-t border-earth-100 pt-5">
          <h3 className="font-semibold">帳務更正</h3>
          <div className="mt-2 divide-y divide-earth-100">
            {adjustmentTargets.map((target) => (
              <div key={target.key} className="py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-earth-800">{target.label}</p>
                    <p className="mt-1 text-xs text-earth-500">{target.settlement === "CASH" ? "現金" : "刷卡"}・NT${target.amount.toLocaleString()}</p>
                  </div>
                  <button type="button" onClick={() => setEditingTargetKey((current) => current === target.key ? null : target.key)} className="min-h-9 rounded-lg border border-earth-200 bg-white px-3 text-xs font-semibold text-earth-700">更正</button>
                </div>
                {editingTargetKey === target.key ? (
                  <form key={target.key} onSubmit={submitAdjustment} className="mt-3 space-y-3 rounded-xl bg-earth-50 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-medium text-earth-600">付款方式<select name="settlement" defaultValue={target.settlement} className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-2 text-sm"><option value="CASH">現金</option><option value="CREDIT_CARD">刷卡</option></select></label>
                      <label className="text-xs font-medium text-earth-600">實收金額<input name="amount" type="number" min="1" max="100000" defaultValue={target.amount} required className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-2 text-sm" /></label>
                    </div>
                    <label className="block text-xs font-medium text-earth-600">更正原因<input name="reason" minLength={2} maxLength={80} required placeholder="例如：付款方式選錯" className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm" /></label>
                    <button type="submit" disabled={isConfirming} className="min-h-10 w-full rounded-lg bg-earth-900 px-3 text-sm font-semibold text-white disabled:opacity-40">儲存更正</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {adjustments.length ? (
        <div className="mt-5 border-t border-earth-100 pt-5">
          <h3 className="font-semibold">更正紀錄</h3>
          <div className="mt-2 space-y-2">
            {adjustments.map((adjustment) => (
              <div key={`${adjustment.adjustedAt}-${adjustment.bookingIds.join("-")}`} className="rounded-xl bg-earth-50 px-3 py-2.5 text-xs text-earth-600">
                <p className="font-medium text-earth-800">{adjustment.time}・{adjustment.customer}</p>
                <p className="mt-1">{adjustment.beforeMethod} NT${adjustment.beforeAmount.toLocaleString()} → {adjustment.afterMethod} NT${adjustment.afterAmount.toLocaleString()}</p>
                <p className="mt-1">{adjustment.reason}・{adjustment.adjustedBy}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {refunds.length ? (
        <div className="mt-5 border-t border-earth-100 pt-5">
          <h3 className="font-semibold">退款／作廢紀錄</h3>
          <div className="mt-2 space-y-2">
            {refunds.map((refund) => (
              <div key={`${refund.refundedAt}-${refund.bookingIds.join("-")}`} className="rounded-xl bg-[#f7ece8] px-3 py-2.5 text-xs text-[#855649]">
                <p className="font-medium">{refund.time}・{refund.customer}・{refund.scope === "GROUP" ? "整組" : "單人"}</p>
                <p className="mt-1">{refund.refundAmount ? `退款 NT$${refund.refundAmount.toLocaleString()}` : "療程次數已補回"}</p>
                <p className="mt-1">{refund.reason}・{refund.refundedBy}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {summary.reconciliationStatus === "READY" && !isReconciled ? (
        <button type="button" onClick={onConfirm} disabled={isConfirming} className="mt-5 min-h-12 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white disabled:opacity-40">{isConfirming ? "核對中…" : "確認本日帳務"}</button>
      ) : null}
      {isReconciled ? <p className="mt-5 rounded-xl bg-primary-50 px-3.5 py-3 text-center text-sm font-semibold text-primary-800">本日帳務已核對</p> : null}
      {summary.reconciliationStatus === "EMPTY" ? <p className="mt-5 text-center text-sm text-earth-500">這一天沒有預約資料</p> : null}
    </section>
  );
}

function DailyGroupDetail({ group, bookings, providers }: { group: SpaDailyGroup; bookings: readonly PreviewBooking[]; providers: readonly PreviewProvider[] }) {
  const ordered = bookings.toSorted((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-earth-500">{group.time}・{group.people} 位同行</p>
          <h2 className="mt-2 text-xl font-semibold text-earth-900">{group.customer}</h2>
        </div>
        <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-800">{group.checkoutMode}</span>
      </div>
      <div className="mt-5 divide-y divide-earth-100 border-y border-earth-100">
        {ordered.map((booking, index) => {
          const provider = providers.find((candidate) => candidate.id === booking.providerId);
          return (
            <div key={booking.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-earth-900">{index === 0 ? "第 1 位" : `同行者 ${index + 1}`}</p>
                  <p className="mt-1 text-sm text-earth-600">{booking.serviceItems.join("＋")}</p>
                  <p className="mt-1 text-xs text-earth-500">{provider ? `${provider.badge}號 ${provider.name}` : "尚未指派"}・{booking.durationMinutes} 分鐘</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-earth-900">NT${(booking.price ?? 0).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-earth-500">{booking.status}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><span className="text-earth-500">付款方式</span><span className="font-semibold text-earth-900">{group.paymentSummary}</span></div>
        <div className="flex justify-between gap-3"><span className="text-earth-500">服務總額</span><span className="font-semibold tabular-nums text-earth-900">NT${group.expectedAmount.toLocaleString()}</span></div>
        {group.refundAmount > 0 ? <div className="flex justify-between gap-3 text-[#855649]"><span>退款／作廢</span><span className="font-semibold tabular-nums">－NT${group.refundAmount.toLocaleString()}</span></div> : null}
        <div className="flex justify-between gap-3 border-t border-earth-100 pt-3"><span className="font-semibold text-earth-900">當日淨收</span><span className="text-lg font-semibold tabular-nums text-earth-900">NT${group.paidAmount.toLocaleString()}</span></div>
      </div>
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
