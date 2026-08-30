"use client";

import { useMemo, useState, useTransition } from "react";
import { createSpaDemoCustomerBooking } from "@/server/actions/spa-demo-customer-booking";
import { createHalfHourTimeOptions, isSpaProviderAvailable, type SpaBookableProvider } from "@/lib/spa-provider-availability";
import { canProviderPerformServices, composeSpaServices, SPA_SERVICE_MENU, summarizeSpaServices } from "@/lib/spa-scheduling";

const candidateTimes = createHalfHourTimeOptions();
const primaryItems = SPA_SERVICE_MENU.filter((item) => item.kind !== "ADD_ON");
const addOnItems = SPA_SERVICE_MENU.filter((item) => item.kind === "ADD_ON");

function isProviderAvailable(provider: SpaBookableProvider, date: string, time: string, serviceMinutes: number) {
  return isSpaProviderAvailable({ provider, date, startTime: time, serviceMinutes, bufferMinutes: 30 });
}

export function SpaServiceComposerPreview({ previewDate, latestDate, providers }: {
  previewDate: string;
  latestDate: string;
  providers: readonly SpaBookableProvider[];
}) {
  const [people, setPeople] = useState(1);
  const [primaryKey, setPrimaryKey] = useState("");
  const [addOnKeys, setAddOnKeys] = useState<readonly string[]>([]);
  const [bookingDate, setBookingDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [providerId, setProviderId] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, startSubmitting] = useTransition();

  const selectedPrimary = SPA_SERVICE_MENU.find((item) => item.key === primaryKey);
  const selectedItems = useMemo(() => selectedPrimary
    ? composeSpaServices(primaryKey, selectedPrimary.kind === "COMBO" ? [] : addOnKeys)
    : [], [addOnKeys, primaryKey, selectedPrimary]);
  const summary = summarizeSpaServices(selectedItems);
  const qualifiedProviders = providers.filter((provider) => canProviderPerformServices(provider.specialties, selectedItems));
  const availableProvidersAt = (time: string) => qualifiedProviders.filter((provider) =>
    isProviderAvailable(provider, bookingDate, time, summary.durationMinutes));
  const availableTimes = bookingDate && selectedPrimary
    ? candidateTimes.filter((time) => availableProvidersAt(time).length >= people)
    : [];
  const providersAtSelectedTime = selectedTime ? availableProvidersAt(selectedTime) : [];
  const safeProviderId = providerId === "" || providersAtSelectedTime.some((provider) => provider.id === providerId)
    ? providerId
    : "";
  const assignedProviders = selectedTime
    ? [...providersAtSelectedTime.filter((provider) => provider.id === safeProviderId), ...providersAtSelectedTime.filter((provider) => provider.id !== safeProviderId)].slice(0, people)
    : [];

  function resetFollowingSteps() {
    setSelectedTime("");
    setProviderId("");
    setNotice("");
  }

  function choosePrimary(nextPrimaryKey: string) {
    const nextPrimary = SPA_SERVICE_MENU.find((item) => item.key === nextPrimaryKey);
    setPrimaryKey(nextPrimaryKey);
    if (nextPrimary?.kind === "COMBO") setAddOnKeys([]);
    setBookingDate("");
    resetFollowingSteps();
  }

  function toggleAddOn(key: string) {
    setAddOnKeys((current) => current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key]);
    resetFollowingSteps();
  }

  function confirmPreview() {
    if (!selectedPrimary || !bookingDate || !selectedTime || assignedProviders.length !== people) return;
    startSubmitting(async () => {
      const result = await createSpaDemoCustomerBooking({
        people,
        bookingDate,
        slotTime: selectedTime,
        providerIds: assignedProviders.map((provider) => provider.id),
        primaryKey,
        addOnKeys: selectedPrimary.kind === "COMBO" ? [] : [...addOnKeys],
      });
      setNotice(result.success
        ? `預約完成：${result.data.bookingDate} ${result.data.slotTime}・${result.data.people} 位`
        : result.error);
    });
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70" aria-label="預約內容">
      <div className="space-y-6 p-5">
        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">1. 人數</legend>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((count) => <button key={count} type="button" onClick={() => { setPeople(count); resetFollowingSteps(); }} className={`min-h-11 rounded-xl border text-sm font-semibold ${people === count ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>{count} 位</button>)}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-earth-900">2. 服務</legend>
          <div className="mt-3 grid gap-2">
            {primaryItems.map((item) => (
              <label key={item.key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 ${primaryKey === item.key ? "border-primary-500 bg-primary-50" : "border-earth-200 bg-white"}`}>
                <span className="flex items-center gap-3"><input type="radio" name="spa-primary-service" checked={primaryKey === item.key} onChange={() => choosePrimary(item.key)} /><span className="text-sm font-semibold text-earth-900">{item.name}</span></span>
                <span className="shrink-0 text-right text-xs text-earth-600"><span className="block font-semibold">{item.durationMinutes} 分</span><span>NT${item.price.toLocaleString()}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {selectedPrimary && selectedPrimary.kind !== "COMBO" ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-earth-700">＋ 加購項目</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {addOnItems.map((item) => <label key={item.key} className={`cursor-pointer rounded-2xl border p-3 ${addOnKeys.includes(item.key) ? "border-primary-400 bg-primary-50" : "border-earth-200"}`}><span className="flex items-center gap-2"><input type="checkbox" checked={addOnKeys.includes(item.key)} onChange={() => toggleAddOn(item.key)} /><span className="text-sm font-medium text-earth-900">{item.name.replace("加購", "")}</span></span><span className="mt-2 block text-xs text-earth-500">＋{item.durationMinutes} 分・NT${item.price.toLocaleString()}</span></label>)}
            </div>
          </details>
        ) : null}

        {selectedPrimary ? <fieldset><legend className="text-sm font-semibold text-earth-900">3. 日期</legend><input aria-label="預約日期" type="date" min={previewDate} max={latestDate} value={bookingDate} onChange={(event) => { setBookingDate(event.target.value); resetFollowingSteps(); }} className="mt-3 min-h-11 w-full rounded-xl border border-earth-200 px-3 outline-none focus:border-primary-500" /></fieldset> : null}

        {bookingDate ? (
          <fieldset>
            <legend className="text-sm font-semibold text-earth-900">4. 可約時段</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableTimes.map((time) => <button key={time} type="button" onClick={() => { setSelectedTime(time); setProviderId(""); setNotice(""); }} className={`rounded-xl border px-3 py-2 text-sm tabular-nums ${selectedTime === time ? "border-primary-500 bg-primary-50 font-semibold text-primary-800" : "border-earth-200 text-earth-600"}`}>{time}</button>)}
              {!availableTimes.length ? <p className="text-sm text-earth-500">當天無法同時安排 {people} 位</p> : null}
            </div>
          </fieldset>
        ) : null}

        {selectedTime ? (
          <fieldset>
            <legend className="text-sm font-semibold text-earth-900">5. 芳療師</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setProviderId("")} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${safeProviderId === "" ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>不指定</button>
              {providersAtSelectedTime.map((provider) => <button key={provider.id} type="button" onClick={() => setProviderId(provider.id)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${safeProviderId === provider.id ? "border-earth-900 bg-earth-900 text-white" : "border-earth-200 text-earth-700"}`}>{provider.label}</button>)}
            </div>
          </fieldset>
        ) : null}

        {selectedPrimary && selectedTime ? <div className="rounded-2xl bg-primary-50 p-4 ring-1 ring-primary-100"><div className="flex items-end justify-between gap-4"><p className="text-sm font-semibold text-earth-900">{people} 位・{summary.durationMinutes} 分鐘</p><p className="text-lg font-semibold text-earth-900">NT${(summary.price * people).toLocaleString()}</p></div></div> : null}
        {selectedTime ? <button type="button" onClick={confirmPreview} disabled={isSubmitting || assignedProviders.length !== people} className="min-h-12 w-full rounded-2xl bg-earth-900 px-4 font-semibold text-white disabled:opacity-40">{isSubmitting ? "預約中…" : "確認預約"}</button> : null}
        {notice ? <p className="text-center text-sm font-medium text-primary-700" aria-live="polite">{notice}</p> : null}
      </div>
    </section>
  );
}
