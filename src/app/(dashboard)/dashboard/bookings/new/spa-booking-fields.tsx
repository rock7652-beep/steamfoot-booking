"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormSection } from "@/components/desktop";
import { formatWeekdayZh } from "@/lib/date-utils";
import { fetchSpaBookingAvailability, type SpaBookingAvailability } from "@/server/actions/spa-booking-availability";
import { useBookingFormValidation } from "./booking-create-form";

export type SpaBookingTreatmentOption = {
  id: string; name: string; variantLabel: string | null; price: number;
  serviceMinutes: number; bufferMinutes: number;
  kind: "SERVICE" | "COMBO" | "ADD_ON"; resourceType: "BED" | "CHAIR";
};

function addMinutes(time: string, minutes: number) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function SpaBookingFields({ days, defaultDate, treatments, defaultServiceStaffId, defaultServiceStaffName, defaultSlotTime }: {
  days: readonly string[]; defaultDate: string; treatments: readonly SpaBookingTreatmentOption[];
  defaultServiceStaffId?: string; defaultServiceStaffName?: string; defaultSlotTime?: string;
}) {
  const { errors, clearError } = useBookingFormValidation();
  const [date, setDate] = useState(days.includes(defaultDate) ? defaultDate : (days[0] ?? ""));
  const [mainId, setMainId] = useState("");
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [availability, setAvailability] = useState<SpaBookingAvailability | null>(null);
  const [providerFilter, setProviderFilter] = useState(defaultServiceStaffId ?? "all");
  const [providerId, setProviderId] = useState("");
  const [slotTime, setSlotTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestedSlotUnavailable, setRequestedSlotUnavailable] = useState(false);
  const requestIdRef = useRef(0);
  const selectedIds = useMemo(() => (mainId ? [mainId, ...addOnIds] : []), [mainId, addOnIds]);
  const mainServices = treatments.filter((item) => item.kind !== "ADD_ON");
  const addOns = treatments.filter((item) => item.kind === "ADD_ON");
  const selectedTreatments = treatments.filter((item) => selectedIds.includes(item.id));
  const summary = {
    serviceMinutes: selectedTreatments.reduce((sum, item) => sum + item.serviceMinutes, 0),
    bufferMinutes: Math.max(0, ...selectedTreatments.map((item) => item.bufferMinutes)),
    totalPrice: selectedTreatments.reduce((sum, item) => sum + item.price, 0),
  };

  useEffect(() => {
    if (!date || !mainId) return;
    const requestId = ++requestIdRef.current;
    void fetchSpaBookingAvailability({ date, treatmentIds: selectedIds }).then((result) => {
      if (requestId !== requestIdRef.current) return;
      if (!result.success) { setAvailability(null); setLoadError(result.error || "暫時無法計算可預約時間"); return; }
      setAvailability(result.data);
      const isOriginalDate = date === defaultDate;
      const requestedProviderId = isOriginalDate ? defaultServiceStaffId : undefined;
      const requestedTime = isOriginalDate ? defaultSlotTime : undefined;
      const preferred = requestedProviderId && result.data.providers.some((provider) => provider.id === requestedProviderId && provider.startTimes.length > 0) ? requestedProviderId : "all";
      setProviderFilter(preferred);
      const provider = result.data.providers.find((item) => item.id === preferred);
      if (requestedTime && provider?.startTimes.includes(requestedTime)) {
        setProviderId(provider.id);
        setSlotTime(requestedTime);
        setRequestedSlotUnavailable(false);
      } else {
        setProviderId("");
        setSlotTime("");
        setRequestedSlotUnavailable(!!requestedTime);
      }
    }).catch(() => {
      if (requestId === requestIdRef.current) { setAvailability(null); setLoadError("暫時無法計算可預約時間"); }
    }).finally(() => { if (requestId === requestIdRef.current) setLoading(false); });
  }, [date, mainId, addOnIds, selectedIds, defaultDate, defaultServiceStaffId, defaultSlotTime]);

  const appointments = (availability?.providers ?? []).filter((provider) => providerFilter === "all" || provider.id === providerFilter)
    .flatMap((provider) => provider.startTimes.map((time) => ({ provider, time })))
    .sort((a, b) => a.time.localeCompare(b.time) || a.provider.displayName.localeCompare(b.provider.displayName));
  function resetAppointment() { clearError("slot"); setProviderId(""); setSlotTime(""); setRequestedSlotUnavailable(false); }
  function beginAvailabilityRefresh() { resetAppointment(); setLoading(true); setLoadError(null); }

  return <>
    <input type="hidden" name="spaMode" value="on" />
    {selectedIds.map((id) => <input key={id} type="hidden" name="treatmentIds" value={id} />)}

    {defaultSlotTime && date === defaultDate ? (
      <div className={`rounded-xl border px-4 py-3 ${requestedSlotUnavailable ? "border-amber-300 bg-amber-50" : "border-primary-300 bg-primary-50"}`} role="status">
        <p className="text-xs font-semibold text-earth-600">從今日工作台帶入</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <p className="text-xl font-bold tabular-nums text-earth-900">{defaultSlotTime}</p>
          <p className="text-sm font-medium text-earth-700">{defaultServiceStaffName ?? "指定服務人員"}</p>
        </div>
        {!mainId ? (
          <p className="mt-1 text-sm text-primary-800">已保留這個起始時間；選擇服務後會確認結束時間與完整空檔。</p>
        ) : requestedSlotUnavailable ? (
          <p className="mt-1 text-sm font-medium text-amber-800">原選時間無法完整容納這項服務，請在第 3 步改選下方可約時段。</p>
        ) : slotTime === defaultSlotTime && availability ? (
          <p className="mt-1 text-sm text-primary-800">已確認：服務至 {addMinutes(defaultSlotTime, availability.serviceMinutes)}{availability.bufferMinutes > 0 ? `，整理至 ${addMinutes(defaultSlotTime, availability.occupiedMinutes)}` : ""}。</p>
        ) : (
          <p className="mt-1 text-sm text-earth-600">正在確認人員、服務時間與空間容量…</p>
        )}
      </div>
    ) : null}

    <FormSection title="1. 想安排哪一天？" description="電話或 LINE 詢問時，先用顧客想來的日期找空檔">
      <select name="bookingDate" required value={date} onChange={(event) => { setDate(event.target.value); if (mainId) beginAvailabilityRefresh(); else resetAppointment(); }} className="block w-full rounded-lg border border-earth-300 bg-white px-3 py-3 text-base text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300">
        {days.map((day) => <option key={day} value={day}>{day}（{formatWeekdayZh(day)}）</option>)}
      </select>
    </FormSection>

    <FormSection title="2. 今天想做什麼？" description="選一個主服務或固定套餐；需要時再加選小項目">
      <div data-booking-treatment-section tabIndex={-1} className="grid gap-2 md:grid-cols-2">
        {mainServices.map((item) => {
          const selected = mainId === item.id;
          return <button key={item.id} type="button" aria-pressed={selected} onClick={() => { clearError("treatment"); setMainId(item.id); setAddOnIds([]); beginAvailabilityRefresh(); }} className={`rounded-xl border p-4 text-left transition ${selected ? "border-primary-600 bg-primary-50 ring-2 ring-primary-200" : "border-earth-200 bg-white hover:border-primary-300"}`}>
            <span className="block text-sm font-semibold text-earth-900">{item.name}</span>
            <span className="mt-1 block text-xs text-earth-500">{item.variantLabel}・{item.resourceType === "CHAIR" ? "沙發椅" : "按摩床"}</span>
            <span className="mt-2 block text-sm font-medium text-earth-700">NT${item.price.toLocaleString("zh-TW")}</span>
          </button>;
        })}
      </div>
      {errors.treatment && <p className="text-sm text-red-600" role="alert">{errors.treatment}</p>}
      {mainId && addOns.length > 0 ? <div><p className="mb-2 text-sm font-medium text-earth-700">加選（選填）</p><div className="flex flex-wrap gap-2">
        {addOns.map((item) => { const selected = addOnIds.includes(item.id); return <button key={item.id} type="button" aria-pressed={selected} onClick={() => { setAddOnIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id]); beginAvailabilityRefresh(); }} className={`rounded-full border px-3 py-2 text-sm ${selected ? "border-primary-600 bg-primary-600 text-white" : "border-earth-300 bg-white text-earth-700"}`}>＋ {item.name} {item.serviceMinutes} 分・NT${item.price}</button>; })}
      </div></div> : null}
      {mainId ? <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3"><div className="flex items-center justify-between gap-3 text-sm font-semibold text-primary-900"><span>服務 {summary.serviceMinutes} 分鐘</span><span>NT${summary.totalPrice.toLocaleString("zh-TW")}</span></div><p className="mt-1 text-xs text-primary-800">整理只計一次 {summary.bufferMinutes} 分鐘・共占用 {summary.serviceMinutes + summary.bufferMinutes} 分鐘</p></div> : null}
    </FormSection>

    <FormSection title="3. 直接選可約時段" description="系統已同時計算專業、班表、既有預約及床位／座椅容量">
      {!mainId ? <p className="rounded-lg bg-earth-50 p-4 text-center text-sm text-earth-500">先選主服務，才會顯示真正可預約的選項。</p> : loading ? <p className="rounded-lg bg-earth-50 p-4 text-center text-sm text-earth-500">正在找最快可接的時段…</p> : loadError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p> : availability ? <>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setProviderFilter("all"); resetAppointment(); }} className={`rounded-full border px-3 py-1.5 text-sm ${providerFilter === "all" ? "border-primary-600 bg-primary-600 text-white" : "border-earth-300 bg-white text-earth-700"}`}>不指定・最快</button>
          {availability.providers.filter((item) => item.startTimes.length > 0).map((provider) => <button key={provider.id} type="button" onClick={() => { setProviderFilter(provider.id); resetAppointment(); }} className={`rounded-full border px-3 py-1.5 text-sm ${providerFilter === provider.id ? "border-primary-600 bg-primary-600 text-white" : "border-earth-300 bg-white text-earth-700"}`}>{provider.displayName}</button>)}</div>
        <div data-booking-slot-section tabIndex={-1} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{appointments.slice(0, 30).map(({ provider, time }) => { const selected = providerId === provider.id && slotTime === time; return <button key={`${provider.id}-${time}`} type="button" onClick={() => { setProviderId(provider.id); setSlotTime(time); setRequestedSlotUnavailable(false); clearError("slot"); }} className={`rounded-xl border p-3 text-left ${selected ? "border-primary-600 bg-primary-50 ring-2 ring-primary-200" : "border-earth-200 bg-white hover:border-primary-300"}`}><span className="block text-base font-bold tabular-nums text-earth-900">{time}–{addMinutes(time, availability.serviceMinutes)}</span><span className="mt-1 block text-sm text-earth-700">{provider.displayName}・{availability.resourceLabel}</span>{availability.bufferMinutes > 0 ? <span className="mt-1 block text-xs text-earth-500">{addMinutes(time, availability.occupiedMinutes)} 整理完成</span> : null}</button>; })}</div>
        {appointments.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">當天沒有同時符合人員與{availability.resourceLabel}容量的完整空檔，請改日期或服務。</p> : null}
        {errors.slot && <p className="text-sm text-red-600" role="alert">{errors.slot}</p>}
      </> : null}
      <input type="hidden" name="people" value="1" /><input type="hidden" name="serviceStaffId" value={providerId} /><input type="hidden" name="slotTime" value={slotTime} />
    </FormSection>
  </>;
}
