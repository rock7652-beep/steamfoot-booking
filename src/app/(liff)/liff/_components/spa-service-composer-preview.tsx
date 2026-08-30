"use client";

import { useMemo, useState, useTransition } from "react";
import { createSpaDemoCustomerBooking } from "@/server/actions/spa-demo-customer-booking";
import type { SpaDemoBooking } from "@/lib/spa-demo-store";
import {
  canProviderPerformServices,
  composeSpaServices,
  hasContinuousAvailability,
  SPA_SERVICE_MENU,
  type SpaProviderSpecialty,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";

type PreviewProvider = {
  id: string;
  label: string;
  specialties: readonly SpaProviderSpecialty[];
  occupiedRanges: readonly { startTime: string; durationMinutes: number }[];
};

const providers: readonly PreviewProvider[] = [
  {
    id: "spa-demo-staff-08",
    label: "08號 陳語安",
    specialties: ["body", "head"],
    occupiedRanges: [{ startTime: "11:00", durationMinutes: 120 }],
  },
  {
    id: "spa-demo-staff-10",
    label: "10號 張若琳",
    specialties: ["body", "head", "foot", "face"],
    occupiedRanges: [{ startTime: "12:30", durationMinutes: 90 }],
  },
  {
    id: "spa-demo-staff-16",
    label: "16號 王心瑜",
    specialties: ["face", "head"],
    occupiedRanges: [{ startTime: "15:00", durationMinutes: 90 }],
  },
] as const;

const candidateTimes = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
] as const;

const primaryItems = SPA_SERVICE_MENU.filter((item) => item.kind !== "ADD_ON");
const addOnItems = SPA_SERVICE_MENU.filter((item) => item.kind === "ADD_ON");

export function SpaServiceComposerPreview({ previewDate, liveBooking }: { previewDate: string; liveBooking?: SpaDemoBooking | null }) {
  const [primaryKey, setPrimaryKey] = useState("aroma_body_60");
  const [addOnKeys, setAddOnKeys] = useState<readonly string[]>([]);
  const [providerId, setProviderId] = useState("spa-demo-staff-08");
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [customerName, setCustomerName] = useState("王小姐");
  const [bookingDate, setBookingDate] = useState(previewDate);
  const [notice, setNotice] = useState("");
  const [isSubmitting, startSubmitting] = useTransition();

  const selectedPrimary = SPA_SERVICE_MENU.find((item) => item.key === primaryKey) ?? primaryItems[0];
  const selectedItems = useMemo(
    () => composeSpaServices(primaryKey, selectedPrimary.kind === "COMBO" ? [] : addOnKeys),
    [addOnKeys, primaryKey, selectedPrimary.kind],
  );
  const summary = summarizeSpaServices(selectedItems);
  const qualifiedProviders = providers.filter((provider) => canProviderPerformServices(provider.specialties, selectedItems));
  const selectedProvider = qualifiedProviders.find((provider) => provider.id === providerId) ?? qualifiedProviders[0];
  const availableTimes = selectedProvider
    ? candidateTimes.filter((time) => hasContinuousAvailability({
      startTime: time,
      serviceMinutes: summary.durationMinutes,
      bufferMinutes: 30,
      closeTime: "21:00",
      occupiedRanges: selectedProvider.occupiedRanges,
    }))
    : [];
  const safeSelectedTime = availableTimes.includes(selectedTime as (typeof candidateTimes)[number])
    ? selectedTime
    : availableTimes[0];

  function choosePrimary(nextPrimaryKey: string) {
    const nextPrimary = SPA_SERVICE_MENU.find((item) => item.key === nextPrimaryKey);
    setPrimaryKey(nextPrimaryKey);
    if (nextPrimary?.kind === "COMBO") setAddOnKeys([]);
    setSelectedTime("");
    setNotice("已重新計算可連續安排的時段。");
  }

  function toggleAddOn(key: string) {
    setAddOnKeys((current) => current.includes(key)
      ? current.filter((candidate) => candidate !== key)
      : [...current, key]);
    setSelectedTime("");
    setNotice("已重新加總療程時間與價格。");
  }

  function confirmPreview() {
    if (!selectedProvider || !safeSelectedTime) return;
    startSubmitting(async () => {
      const result = await createSpaDemoCustomerBooking({
        customerName,
        bookingDate,
        slotTime: safeSelectedTime,
        providerId: selectedProvider.id,
        primaryKey,
        addOnKeys: selectedPrimary.kind === "COMBO" ? [] : [...addOnKeys],
      });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setNotice(`預約完成：${result.data.bookingDate} ${result.data.slotTime}・${selectedProvider.label}`);
    });
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70" aria-labelledby="spa-composer-title">
      <div className="bg-earth-900 px-5 py-5 text-white">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary-200">複合療程預約</p>
        <h2 id="spa-composer-title" className="mt-2 text-xl font-semibold">自由搭配，時間自動加總</h2>
        <p className="mt-2 text-sm leading-relaxed text-earth-200">可選主療程＋加購，也可直接選店家搭好的組合方案。</p>
      </div>

      <div className="space-y-6 p-5">
        {liveBooking ? (
          <div className={`rounded-2xl border p-4 ${liveBooking.status === "已完成" ? "border-primary-200 bg-primary-50" : "border-earth-200 bg-earth-50"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-earth-500">最新預約</p><p className="mt-1 font-semibold text-earth-900">{liveBooking.date}・{liveBooking.time}・{liveBooking.service}</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary-700">{liveBooking.status}</span></div>
            {liveBooking.status === "已完成" ? <div className="mt-2 text-sm font-medium text-primary-800"><p>店長已完成服務・{liveBooking.settlementLabel ?? "結帳完成"}{liveBooking.settlementAmount ? `・NT$${liveBooking.settlementAmount.toLocaleString()}` : ""}</p>{liveBooking.settlementLabel === "儲值金" ? <p className="mt-1">儲值金餘額：NT${(liveBooking.storedValueBalance ?? 0).toLocaleString()}</p> : null}{liveBooking.settlementLabel === "扣療程 1 次" ? <p className="mt-1">療程剩餘：{liveBooking.packageRemainingSessions ?? 0} 次</p> : null}</div> : null}
          </div>
        ) : null}
        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">1. 選擇主療程或組合</legend>
          <div className="mt-3 grid gap-2">
            {primaryItems.map((item) => (
              <label key={item.key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 ${primaryKey === item.key ? "border-primary-500 bg-primary-50" : "border-earth-200 bg-white"}`}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="spa-primary-service" value={item.key} checked={primaryKey === item.key} onChange={() => choosePrimary(item.key)} />
                  <span><span className="block text-sm font-semibold text-earth-900">{item.name}</span><span className="mt-1 block text-xs text-earth-500">{item.kind === "COMBO" ? "人氣組合方案" : "主療程"}</span></span>
                </span>
                <span className="shrink-0 text-right text-xs text-earth-600"><span className="block font-semibold">{item.durationMinutes} 分</span><span>NT${item.price.toLocaleString()}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {selectedPrimary.kind !== "COMBO" ? (
          <fieldset>
            <legend className="text-sm font-semibold text-earth-900">2. 加購項目（可複選）</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {addOnItems.map((item) => (
                <label key={item.key} className={`cursor-pointer rounded-2xl border p-3 ${addOnKeys.includes(item.key) ? "border-primary-400 bg-primary-50" : "border-earth-200"}`}>
                  <span className="flex items-center gap-2"><input type="checkbox" checked={addOnKeys.includes(item.key)} onChange={() => toggleAddOn(item.key)} /><span className="text-sm font-medium text-earth-900">{item.name.replace("加購", "")}</span></span>
                  <span className="mt-2 block text-xs text-earth-500">＋{item.durationMinutes} 分・NT${item.price.toLocaleString()}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="rounded-2xl bg-primary-50 p-4 ring-1 ring-primary-100">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs text-primary-700">已選 {selectedItems.length} 個項目</p><p className="mt-1 text-lg font-semibold text-earth-900">共 {summary.durationMinutes} 分鐘</p></div>
            <p className="text-right text-sm text-earth-600">預估<br /><span className="text-lg font-semibold text-earth-900">NT${summary.price.toLocaleString()}</span></p>
          </div>
          <p className="mt-3 border-t border-primary-100 pt-3 text-xs leading-relaxed text-earth-600">所有項目由同一位芳療師完成。</p>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">3. 選擇芳療師號牌</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {qualifiedProviders.map((provider) => (
              <label key={provider.id} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${selectedProvider?.id === provider.id ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>
                <input className="sr-only" type="radio" name="spa-provider" value={provider.id} checked={selectedProvider?.id === provider.id} onChange={() => { setProviderId(provider.id); setSelectedTime(""); }} />
                {provider.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">4. 選擇日期與時間</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-earth-700">姓名<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={30} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3 outline-none focus:border-primary-500" /></label>
            <label className="text-sm font-medium text-earth-700">預約日期<input type="date" min={previewDate} max={previewDate} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-earth-200 px-3 outline-none focus:border-primary-500" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableTimes.slice(0, 6).map((time) => (
              <label key={time} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm tabular-nums ${safeSelectedTime === time ? "border-primary-500 bg-primary-50 font-semibold text-primary-800" : "border-earth-200 text-earth-600"}`}>
                <input className="sr-only" type="radio" name="spa-time" value={time} checked={safeSelectedTime === time} onChange={() => setSelectedTime(time)} />
                {time}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="button" onClick={confirmPreview} disabled={isSubmitting || !customerName.trim() || !bookingDate || !selectedProvider || !safeSelectedTime} className="min-h-12 w-full rounded-2xl bg-earth-900 px-4 font-semibold text-white disabled:opacity-40">{isSubmitting ? "預約中…" : "確認預約"}</button>
        {notice ? <p className="text-center text-sm font-medium text-primary-700" aria-live="polite">{notice}</p> : null}
      </div>
    </section>
  );
}
