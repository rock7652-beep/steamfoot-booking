"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { cancelSpaDemoBooking } from "@/server/actions/spa-demo-booking-management";
import { createSpaDemoCustomerBooking } from "@/server/actions/spa-demo-customer-booking";
import { createHalfHourTimeOptions, isSpaProviderAvailable, type SpaBookableProvider } from "@/lib/spa-provider-availability";
import { canProviderPerformServices, composeSpaServices, SPA_SERVICE_MENU, summarizeSpaServices, type SpaServiceItem } from "@/lib/spa-scheduling";
import { findSpaPartyProviderAssignment } from "@/lib/spa-party-assignment";

const candidateTimes = createHalfHourTimeOptions();
const primaryItems = SPA_SERVICE_MENU.filter((item) => item.kind !== "ADD_ON");
const addOnItems = SPA_SERVICE_MENU.filter((item) => item.kind === "ADD_ON");

type GuestSelection = {
  primaryKey: string;
  addOnKeys: readonly string[];
  providerId: string;
};

type CompletedGuest = {
  bookingId: string;
  label: string;
  service: string;
  durationMinutes: number;
  price: number;
  provider: string;
  primaryKey: string;
  addOnKeys: readonly string[];
};

export type SpaCompletedBookingPreview = {
  date: string;
  time: string;
  guests: readonly CompletedGuest[];
  totalPrice: number;
  status?: "已確認" | "已完成";
  settlementLabel?: string | null;
  settlementAmount?: number | null;
  storedValueBalance?: number | null;
  packageRemainingSessions?: number | null;
};

const emptyGuest = (): GuestSelection => ({ primaryKey: "", addOnKeys: [], providerId: "" });

function guestLabel(index: number) {
  return index === 0 ? "第 1 位" : `同行者 ${index + 1}`;
}

function formatBookingDate(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

function selectedItemsFor(guest: GuestSelection): readonly SpaServiceItem[] {
  if (!guest.primaryKey) return [];
  const primary = SPA_SERVICE_MENU.find((item) => item.key === guest.primaryKey);
  return composeSpaServices(guest.primaryKey, primary?.kind === "COMBO" ? [] : guest.addOnKeys);
}

function isProviderAvailable(provider: SpaBookableProvider, date: string, time: string, serviceMinutes: number) {
  return isSpaProviderAvailable({ provider, date, startTime: time, serviceMinutes, bufferMinutes: 30 });
}

export function SpaServiceComposerPreview({ previewDate, latestDate, providers, initialCompletedBooking = null }: {
  previewDate: string;
  latestDate: string;
  providers: readonly SpaBookableProvider[];
  initialCompletedBooking?: SpaCompletedBookingPreview | null;
}) {
  const [people, setPeople] = useState(1);
  const [guests, setGuests] = useState<readonly GuestSelection[]>([emptyGuest()]);
  const [activeGuestIndex, setActiveGuestIndex] = useState(0);
  const [bookingDate, setBookingDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notice, setNotice] = useState("");
  const [completedBooking, setCompletedBooking] = useState<SpaCompletedBookingPreview | null>(initialCompletedBooking);
  const [isEditing, setIsEditing] = useState(false);
  const [showCancelOptions, setShowCancelOptions] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ bookingId: string; scope: "GUEST" | "GROUP" } | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  const guestItems = useMemo(() => guests.map(selectedItemsFor), [guests]);
  const guestSummaries = useMemo(() => guestItems.map(summarizeSpaServices), [guestItems]);
  const allServicesSelected = guestItems.every((items) => items.length > 0);
  const activeGuest = guests[activeGuestIndex] ?? guests[0];
  const activePrimary = SPA_SERVICE_MENU.find((item) => item.key === activeGuest.primaryKey);
  const totalPrice = guestSummaries.reduce((total, summary) => total + summary.price, 0);

  const availableTimes = bookingDate && allServicesSelected
    ? candidateTimes.filter((time) => findSpaPartyProviderAssignment({ requests: guests.map((guest) => ({ items: selectedItemsFor(guest), providerId: guest.providerId })), providers, date: bookingDate, time }).length === people)
    : [];
  const assignedProviders = selectedTime
    ? findSpaPartyProviderAssignment({ requests: guests.map((guest) => ({ items: selectedItemsFor(guest), providerId: guest.providerId })), providers, date: bookingDate, time: selectedTime })
    : [];

  function resetSchedule() {
    if (!isEditing) setBookingDate("");
    setSelectedTime("");
    setNotice("");
  }

  function resetBookingForm() {
    setPeople(1);
    setGuests([emptyGuest()]);
    setActiveGuestIndex(0);
    setBookingDate("");
    setSelectedTime("");
  }

  function beginEdit() {
    if (!completedBooking || completedBooking.status === "已完成") return;
    setPeople(completedBooking.guests.length);
    setGuests(completedBooking.guests.map((guest) => ({
      primaryKey: guest.primaryKey,
      addOnKeys: [...guest.addOnKeys],
      providerId: "",
    })));
    setActiveGuestIndex(0);
    setBookingDate(completedBooking.date);
    setSelectedTime(completedBooking.time);
    setNotice("");
    setShowCancelOptions(false);
    setIsEditing(true);
  }

  function changePeople(count: number) {
    setPeople(count);
    setGuests((current) => Array.from({ length: count }, (_, index) => current[index] ?? emptyGuest()));
    setActiveGuestIndex((current) => Math.min(current, count - 1));
    resetSchedule();
  }

  function updateGuest(index: number, update: (guest: GuestSelection) => GuestSelection) {
    setGuests((current) => current.map((guest, guestIndex) => guestIndex === index ? update(guest) : guest));
    resetSchedule();
  }

  function choosePrimary(primaryKey: string) {
    const primary = SPA_SERVICE_MENU.find((item) => item.key === primaryKey);
    updateGuest(activeGuestIndex, (guest) => ({
      ...guest,
      primaryKey,
      addOnKeys: primary?.kind === "COMBO" ? [] : guest.addOnKeys,
      providerId: "",
    }));
  }

  function toggleAddOn(key: string) {
    updateGuest(activeGuestIndex, (guest) => ({
      ...guest,
      addOnKeys: guest.addOnKeys.includes(key)
        ? guest.addOnKeys.filter((candidate) => candidate !== key)
        : [...guest.addOnKeys, key],
      providerId: "",
    }));
  }

  function copyFirstGuest() {
    const first = guests[0];
    if (!first.primaryKey || activeGuestIndex === 0) return;
    updateGuest(activeGuestIndex, () => ({ ...first, addOnKeys: [...first.addOnKeys], providerId: "" }));
  }

  function chooseProvider(index: number, providerId: string) {
    setGuests((current) => current.map((guest, guestIndex) => guestIndex === index ? { ...guest, providerId } : guest));
    setNotice("");
  }

  function providersForGuest(index: number) {
    const items = guestItems[index];
    const durationMinutes = guestSummaries[index].durationMinutes;
    return providers.filter((provider) =>
      canProviderPerformServices(provider.specialties, items)
      && isProviderAvailable(provider, bookingDate, selectedTime, durationMinutes));
  }

  function confirmPreview() {
    if (!bookingDate || !selectedTime || assignedProviders.length !== people) return;
    startSubmitting(async () => {
      const result = await createSpaDemoCustomerBooking({
        bookingDate,
        slotTime: selectedTime,
        bookingOperation: isEditing ? "UPDATE" : "CREATE",
        guests: guests.map((guest, index) => ({
          primaryKey: guest.primaryKey,
          addOnKeys: [...guest.addOnKeys],
          providerId: assignedProviders[index].id,
        })),
      });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setCompletedBooking({
        date: result.data.bookingDate,
        time: result.data.slotTime,
        totalPrice,
        status: "已確認",
        guests: guests.map((guest, index) => ({
          bookingId: result.data.bookingIds[index],
          label: guestLabel(index),
          service: guestItems[index].map((item) => item.name.replace("加購", "")).join("＋"),
          durationMinutes: guestSummaries[index].durationMinutes,
          price: guestSummaries[index].price,
          provider: assignedProviders[index].label,
          primaryKey: guest.primaryKey,
          addOnKeys: [...guest.addOnKeys],
        })),
      });
      setIsEditing(false);
      setNotice("");
    });
  }

  function confirmCancellation() {
    if (!cancelTarget || !completedBooking) return;
    startSubmitting(async () => {
      const result = await cancelSpaDemoBooking(cancelTarget);
      if (!result.success) {
        setNotice(result.error);
        setCancelTarget(null);
        return;
      }
      if (result.data.cancelledAll) {
        setCompletedBooking(null);
        setShowCancelOptions(false);
        setCancelTarget(null);
        resetBookingForm();
        setNotice("預約已取消");
        return;
      }
      const survivors = completedBooking.guests.filter((guest) => guest.bookingId !== cancelTarget.bookingId);
      const relabelled = survivors.map((guest, index) => ({
        ...guest,
        bookingId: result.data.bookingIds[index],
        label: guestLabel(index),
      }));
      setCompletedBooking({
        ...completedBooking,
        guests: relabelled,
        totalPrice: relabelled.reduce((total, guest) => total + guest.price, 0),
      });
      setCancelTarget(null);
      setShowCancelOptions(false);
      setNotice("此位預約已取消");
    });
  }

  if (completedBooking && !isEditing) {
    return (
      <section className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70" aria-label="預約完成">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-2xl text-primary-800" aria-hidden>✓</div>
        <p className="mt-5 text-sm font-semibold text-primary-700">{completedBooking.status === "已完成" ? "服務與結帳完成" : "預約完成"}</p>
        <h2 className="mt-1 text-2xl font-semibold text-earth-900">{formatBookingDate(completedBooking.date)} {completedBooking.time}</h2>
        <div className="mt-5 space-y-3 border-y border-earth-100 py-4">
          {completedBooking.guests.map((guest) => (
            <div key={guest.bookingId} className="rounded-2xl bg-earth-50 p-4 text-sm">
              <div className="flex items-start justify-between gap-3"><p className="font-semibold text-earth-900">{guest.label}</p><p className="shrink-0 text-earth-500">{guest.durationMinutes} 分鐘</p></div>
              <p className="mt-2 text-earth-700">{guest.service}</p>
              <p className="mt-1 text-xs text-earth-500">{guest.provider}</p>
            </div>
          ))}
          <div className="flex justify-between gap-4 px-1 pt-1 text-sm"><span className="text-earth-500">合計</span><span className="font-semibold text-earth-900">NT${completedBooking.totalPrice.toLocaleString()}</span></div>
        </div>
        {completedBooking.status === "已完成" ? <div className="mt-4 rounded-2xl bg-primary-50 p-4 text-sm text-primary-900"><p className="font-semibold">整組已結帳・{completedBooking.settlementLabel ?? "完成"}{completedBooking.settlementAmount ? `・NT$${completedBooking.settlementAmount.toLocaleString()}` : ""}</p>{completedBooking.settlementLabel === "儲值金" ? <p className="mt-1 text-xs">儲值金餘額 NT${(completedBooking.storedValueBalance ?? 0).toLocaleString()}</p> : null}{completedBooking.settlementLabel?.startsWith("扣療程") ? <p className="mt-1 text-xs">療程剩餘 {completedBooking.packageRemainingSessions ?? 0} 次</p> : null}</div> : null}
        {completedBooking.status !== "已完成" ? (
          <div className="mt-5 space-y-3">
            {!showCancelOptions ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={beginEdit} className="min-h-12 rounded-2xl bg-earth-900 px-4 font-semibold text-white">修改預約</button>
                <button type="button" onClick={() => { setShowCancelOptions(true); setNotice(""); }} className="min-h-12 rounded-2xl border border-earth-200 px-4 font-semibold text-earth-700">取消預約</button>
              </div>
            ) : (
              <div className="rounded-2xl border border-earth-200 p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-semibold text-earth-900">選擇取消範圍</p><button type="button" onClick={() => { setShowCancelOptions(false); setCancelTarget(null); }} className="text-sm text-earth-500">返回</button></div>
                {completedBooking.guests.length > 1 ? <div className="mt-3 grid gap-2">{completedBooking.guests.map((guest) => <button key={guest.bookingId} type="button" onClick={() => setCancelTarget({ bookingId: guest.bookingId, scope: "GUEST" })} className="min-h-11 rounded-xl border border-earth-200 px-3 text-left text-sm font-medium text-earth-700">取消{guest.label}・{guest.service}</button>)}</div> : null}
                <button type="button" onClick={() => setCancelTarget({ bookingId: completedBooking.guests[0].bookingId, scope: "GROUP" })} className="mt-2 min-h-11 w-full rounded-xl bg-[#9a5d4d] px-3 text-sm font-semibold text-white">取消整組預約</button>
              </div>
            )}
            {cancelTarget ? <div className="rounded-2xl bg-[#fbf2ef] p-4 text-sm"><p className="font-semibold text-earth-900">{cancelTarget.scope === "GROUP" ? "確定取消整組預約？" : "確定取消這一位？"}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setCancelTarget(null)} className="min-h-11 rounded-xl border border-earth-200 bg-white font-semibold text-earth-700">保留預約</button><button type="button" disabled={isSubmitting} onClick={confirmCancellation} className="min-h-11 rounded-xl bg-[#9a5d4d] font-semibold text-white disabled:opacity-40">{isSubmitting ? "處理中…" : "確認取消"}</button></div></div> : null}
          </div>
        ) : null}
        {notice ? <p className="mt-4 text-center text-sm font-medium text-primary-700" aria-live="polite">{notice}</p> : null}
        <Link href="/s/demo/liff/design-preview" className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-earth-200 px-4 font-semibold text-earth-700">返回會員中心</Link>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70" aria-label="預約內容">
      <div className="space-y-6 p-5">
        {isEditing ? <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-earth-900">修改預約</h2><button type="button" onClick={() => { setIsEditing(false); setNotice(""); }} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-earth-500">返回</button></div> : null}
        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">1. 人數</legend>
          {isEditing ? <p className="mt-3 rounded-xl bg-earth-50 px-4 py-3 text-sm font-semibold text-earth-800">{people} 位</p> : <div className="mt-3 grid grid-cols-3 gap-2">{[1, 2, 3].map((count) => <button key={count} type="button" onClick={() => changePeople(count)} className={`min-h-11 rounded-xl border text-sm font-semibold ${people === count ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>{count} 位</button>)}</div>}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">2. 每位服務</legend>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${people}, minmax(0, 1fr))` }}>
            {guests.map((guest, index) => {
              const summary = guestSummaries[index];
              return <button key={index} type="button" onClick={() => setActiveGuestIndex(index)} className={`min-h-16 rounded-2xl border p-3 text-left ${activeGuestIndex === index ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 bg-white text-earth-700"}`}><span className="block text-sm font-semibold">{guestLabel(index)}</span><span className={`mt-1 block text-xs ${activeGuestIndex === index ? "text-white/70" : "text-earth-500"}`}>{guest.primaryKey ? `${summary.durationMinutes} 分・NT$${summary.price.toLocaleString()}` : "尚未選擇"}</span></button>;
            })}
          </div>

          {activeGuestIndex > 0 && guests[0].primaryKey ? <button type="button" onClick={copyFirstGuest} className="mt-3 rounded-xl border border-earth-200 px-3 py-2 text-xs font-semibold text-earth-600">套用第 1 位服務</button> : null}

          <div className="mt-3 grid gap-2">
            {primaryItems.map((item) => (
              <label key={item.key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 ${activeGuest.primaryKey === item.key ? "border-primary-500 bg-primary-50" : "border-earth-200 bg-white"}`}>
                <span className="flex items-center gap-3"><input type="radio" name={`spa-primary-service-${activeGuestIndex}`} checked={activeGuest.primaryKey === item.key} onChange={() => choosePrimary(item.key)} /><span className="text-sm font-semibold text-earth-900">{item.name}</span></span>
                <span className="shrink-0 text-right text-xs text-earth-600"><span className="block font-semibold">{item.durationMinutes} 分</span><span>NT${item.price.toLocaleString()}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {activePrimary && activePrimary.kind !== "COMBO" ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-earth-700">＋ {guestLabel(activeGuestIndex)}加購</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {addOnItems.map((item) => <label key={item.key} className={`cursor-pointer rounded-2xl border p-3 ${activeGuest.addOnKeys.includes(item.key) ? "border-primary-400 bg-primary-50" : "border-earth-200"}`}><span className="flex items-center gap-2"><input type="checkbox" checked={activeGuest.addOnKeys.includes(item.key)} onChange={() => toggleAddOn(item.key)} /><span className="text-sm font-medium text-earth-900">{item.name.replace("加購", "")}</span></span><span className="mt-2 block text-xs text-earth-500">＋{item.durationMinutes} 分・NT${item.price.toLocaleString()}</span></label>)}
            </div>
          </details>
        ) : null}

        {allServicesSelected ? <fieldset><legend className="text-sm font-semibold text-earth-900">3. 日期</legend><input aria-label="預約日期" type="date" min={previewDate} max={latestDate} value={bookingDate} onChange={(event) => { setBookingDate(event.target.value); setSelectedTime(""); setGuests((current) => current.map((guest) => ({ ...guest, providerId: "" }))); setNotice(""); }} onBlur={(event) => { if (event.currentTarget.value !== bookingDate) { setBookingDate(event.currentTarget.value); setSelectedTime(""); setGuests((current) => current.map((guest) => ({ ...guest, providerId: "" }))); setNotice(""); } }} className="mt-3 min-h-11 w-full rounded-xl border border-earth-200 px-3 outline-none focus:border-primary-500" /></fieldset> : null}

        {bookingDate ? (
          <fieldset>
            <legend className="text-sm font-semibold text-earth-900">4. 可約時段</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableTimes.map((time) => <button key={time} type="button" onClick={() => { setSelectedTime(time); setGuests((current) => current.map((guest) => ({ ...guest, providerId: "" }))); setNotice(""); }} className={`rounded-xl border px-3 py-2 text-sm tabular-nums ${selectedTime === time ? "border-primary-500 bg-primary-50 font-semibold text-primary-800" : "border-earth-200 text-earth-600"}`}>{time}</button>)}
              {!availableTimes.length ? <p className="text-sm text-earth-500">當天無法同時安排 {people} 位</p> : null}
            </div>
          </fieldset>
        ) : null}

        {selectedTime ? (
          <fieldset>
            <legend className="text-sm font-semibold text-earth-900">5. 芳療師</legend>
            <div className="mt-3 space-y-3">
              {guests.map((guest, index) => {
                const otherSelectedIds = guests.filter((_, guestIndex) => guestIndex !== index).map((item) => item.providerId).filter(Boolean);
                return (
                  <div key={index} className="rounded-2xl border border-earth-200 p-3">
                    <p className="text-sm font-semibold text-earth-900">{guestLabel(index)}・{guestItems[index].map((item) => item.name.replace("加購", "")).join("＋")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => chooseProvider(index, "")} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${guest.providerId === "" ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>不指定</button>
                      {providersForGuest(index).map((provider) => <button key={provider.id} type="button" disabled={otherSelectedIds.includes(provider.id)} onClick={() => chooseProvider(index, provider.id)} className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-30 ${guest.providerId === provider.id ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>{provider.label}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>
            {assignedProviders.length !== people && guests.some((guest) => guest.providerId) ? <p className="mt-3 text-sm font-medium text-[#9a5d4d]">目前指定方式無法同時安排，請將其中一位改為不指定。</p> : null}
          </fieldset>
        ) : null}

        {selectedTime ? <div className="rounded-2xl bg-primary-50 p-4 ring-1 ring-primary-100"><div className="flex items-end justify-between gap-4"><p className="text-sm font-semibold text-earth-900">{people} 位・{guestSummaries.map((summary) => `${summary.durationMinutes} 分`).join("／")}</p><p className="text-lg font-semibold text-earth-900">NT${totalPrice.toLocaleString()}</p></div></div> : null}
        {selectedTime ? <button type="button" onClick={confirmPreview} disabled={isSubmitting || assignedProviders.length !== people} className="min-h-12 w-full rounded-2xl bg-earth-900 px-4 font-semibold text-white disabled:opacity-40">{isSubmitting ? "處理中…" : isEditing ? "儲存修改" : "確認預約"}</button> : null}
        {notice ? <p className="text-center text-sm font-medium text-primary-700" aria-live="polite">{notice}</p> : null}
      </div>
    </section>
  );
}
