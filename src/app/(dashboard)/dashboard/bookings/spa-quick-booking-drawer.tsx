"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { fetchSpaBookingAvailability, type SpaBookingAvailability } from "@/server/actions/spa-booking-availability";
import { createSpaQuickBooking } from "@/server/actions/spa-quick-booking";
import { addMinutes } from "@/lib/spa-scheduling";
import { buildSpaQuickAlternatives } from "@/lib/spa-quick-alternatives";

export type SpaQuickTreatment = {
  id: string;
  name: string;
  variant: string;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  kind: "SERVICE" | "COMBO" | "ADD_ON";
  resourceType: "BED" | "CHAIR";
};

export type SpaQuickTarget = { providerId: string; time: string };

type Provider = { id: string; displayName: string; colorCode: string };
type Appointment = { providerId: string; providerName: string; time: string };
type CustomerResult = { id: string; name: string; phone: string; email: string | null };

export function SpaQuickBookingDrawer({
  date,
  target,
  providers,
  treatments,
  onClose,
  onCreated,
}: {
  date: string;
  target: SpaQuickTarget;
  providers: readonly Provider[];
  treatments: readonly SpaQuickTreatment[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [customerFallbackLabel, setCustomerFallbackLabel] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [mainId, setMainId] = useState("");
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [availability, setAvailability] = useState<SpaBookingAvailability | null>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const requestKeyRef = useRef("");

  const selectedIds = useMemo(
    () => (mainId ? [mainId, ...addOnIds] : []),
    [mainId, addOnIds],
  );
  const selectedTreatments = treatments.filter((item) => selectedIds.includes(item.id));
  const summary = {
    serviceMinutes: selectedTreatments.reduce((sum, item) => sum + item.serviceMinutes, 0),
    bufferMinutes: Math.max(0, ...selectedTreatments.map((item) => item.bufferMinutes)),
    totalPrice: selectedTreatments.reduce((sum, item) => sum + item.price, 0),
  };
  const originalProvider = providers.find((provider) => provider.id === target.providerId);
  const mainServices = treatments.filter((item) => item.kind !== "ADD_ON");
  const addOns = treatments.filter((item) => item.kind === "ADD_ON");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function refreshAvailability(treatmentIds: string[]) {
    const requestId = ++requestIdRef.current;
    setLoadingAvailability(true);
    setAvailabilityError("");
    setAppointment(null);
    void fetchSpaBookingAvailability({ date, treatmentIds })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        if (!result.success) {
          setAvailability(null);
          setAppointment(null);
          setAvailabilityError(result.error || "暫時無法確認空檔");
          return;
        }
        setAvailability(result.data);
        const requestedProvider = result.data.providers.find((provider) => provider.id === target.providerId);
        setAppointment(
          requestedProvider?.startTimes.includes(target.time)
            ? { providerId: requestedProvider.id, providerName: requestedProvider.displayName, time: target.time }
            : null,
        );
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setAvailability(null);
          setAppointment(null);
          setAvailabilityError("暫時無法確認空檔，請重試");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoadingAvailability(false);
      });
  }

  function selectMain(id: string) {
    setMainId(id);
    setAddOnIds([]);
    refreshAvailability([id]);
  }

  function toggleAddOn(id: string) {
    const next = addOnIds.includes(id)
      ? addOnIds.filter((current) => current !== id)
      : [...addOnIds, id];
    setAddOnIds(next);
    refreshAvailability([mainId, ...next]);
  }

  const alternatives = useMemo(() => {
    if (!availability) return [];
    return buildSpaQuickAlternatives({
      requestedProviderId: target.providerId,
      requestedTime: target.time,
      providers: availability.providers,
    });
  }, [availability, target.providerId, target.time]);

  const canSubmit =
    !!mainId &&
    !!appointment &&
    !loadingAvailability &&
    (customerMode === "existing"
      ? !!customerId
      : !!newName.trim() && /^09\d{8}$/.test(newPhone));

  function submit() {
    if (!canSubmit || !appointment) return;
    setSubmitError("");
    startTransition(async () => {
      if (!requestKeyRef.current) requestKeyRef.current = crypto.randomUUID();
      const result = await createSpaQuickBooking({
        ...(customerMode === "existing"
          ? { customerId }
          : { newCustomer: { name: newName.trim(), phone: newPhone } }),
        bookingDate: date,
        slotTime: appointment.time,
        serviceStaffId: appointment.providerId,
        treatmentIds: selectedIds,
        notes: notes.trim() || undefined,
        requestKey: requestKeyRef.current,
      });
      if (!result.success) {
        setSubmitError(result.error);
        if (result.customerId) {
          setCustomerMode("existing");
          setCustomerId(result.customerId);
          setCustomerFallbackLabel(`${newName.trim()}（${newPhone}）`);
        }
        return;
      }
      toast.success(`已建立 ${appointment.time} 預約`);
      onCreated();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="關閉快速排預約" onClick={onClose} className="absolute inset-0 bg-earth-950/30" />
      <aside role="dialog" aria-modal="true" aria-labelledby="spa-quick-booking-title" className="relative h-full w-full max-w-xl overflow-y-auto bg-earth-50 shadow-2xl">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-earth-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-primary-700">快速排預約</p>
            <h2 id="spa-quick-booking-title" className="mt-0.5 text-lg font-bold text-earth-900">
              {date.slice(5).replace("-", "/")}・{target.time}・{originalProvider?.displayName ?? "服務人員"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-earth-500 hover:bg-earth-100" aria-label="關閉">✕</button>
        </header>

        <div className="space-y-4 p-5 pb-28">
          <section className="rounded-xl border border-earth-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-earth-900">1. 顧客</h3>
              <div className="flex rounded-lg bg-earth-100 p-1 text-xs">
                <button type="button" onClick={() => setCustomerMode("existing")} className={`rounded-md px-3 py-1.5 ${customerMode === "existing" ? "bg-white font-semibold text-primary-700 shadow-sm" : "text-earth-500"}`}>既有顧客</button>
                <button type="button" onClick={() => setCustomerMode("new")} className={`rounded-md px-3 py-1.5 ${customerMode === "new" ? "bg-white font-semibold text-primary-700 shadow-sm" : "text-earth-500"}`}>新顧客</button>
              </div>
            </div>
            {customerMode === "existing" ? (
              <QuickCustomerSearch value={customerId} fallbackLabel={customerFallbackLabel} onChange={(id) => { setCustomerId(id); if (!id) setCustomerFallbackLabel(""); }} />
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="姓名" className={inputClass} />
                <input inputMode="tel" value={newPhone} onChange={(event) => setNewPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="手機 09xxxxxxxx" className={inputClass} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-earth-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-earth-900">2. 勾選服務</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {mainServices.map((item) => {
                const selected = mainId === item.id;
                return <button key={item.id} type="button" aria-pressed={selected} onClick={() => selectMain(item.id)} className={`rounded-lg border p-3 text-left ${selected ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200" : "border-earth-200 hover:border-primary-300"}`}><span className="block text-sm font-semibold text-earth-900">{selected ? "✓ " : ""}{item.name}</span><span className="mt-1 block text-xs text-earth-500">{item.variant}・NT${item.price.toLocaleString("zh-TW")}</span></button>;
              })}
            </div>
            {mainId && addOns.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{addOns.map((item) => { const selected = addOnIds.includes(item.id); return <button key={item.id} type="button" onClick={() => toggleAddOn(item.id)} className={`rounded-full border px-3 py-2 text-xs ${selected ? "border-primary-600 bg-primary-600 text-white" : "border-earth-300 text-earth-700"}`}>{selected ? "✓" : "+"} {item.name} {item.serviceMinutes}分</button>; })}</div> : null}
            {mainId ? <div className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900"><div className="flex justify-between font-semibold"><span>服務 {summary.serviceMinutes} 分</span><span>NT${summary.totalPrice.toLocaleString("zh-TW")}</span></div><p className="mt-1 text-xs">整理 {summary.bufferMinutes} 分・共占用 {summary.serviceMinutes + summary.bufferMinutes} 分鐘</p></div> : null}
          </section>

          <section className="rounded-xl border border-earth-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-earth-900">3. 系統確認</h3>
            {!mainId ? <p className="mt-2 text-sm text-earth-500">選擇服務後，系統會確認人員專業、連續空檔及床位。</p> : loadingAvailability ? <p className="mt-2 text-sm text-earth-500">正在確認完整空檔…</p> : availabilityError ? <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{availabilityError}</p> : appointment ? <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-semibold text-emerald-900">✓ 可以直接安排</p><p className="mt-1 text-sm tabular-nums text-emerald-800">{appointment.time}–{addMinutes(appointment.time, summary.serviceMinutes)}・{appointment.providerName}</p>{summary.bufferMinutes > 0 ? <p className="mt-1 text-xs text-emerald-700">整理至 {addMinutes(appointment.time, summary.serviceMinutes + summary.bufferMinutes)}</p> : null}</div> : <div className="mt-2"><p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">原訂 {target.time}・{originalProvider?.displayName} 無法容納完整服務，請直接選擇建議：</p><div className="mt-2 grid gap-2">{alternatives.map((item, index) => <button key={`${item.providerId}-${item.time}`} type="button" onClick={() => setAppointment(item)} className="flex items-center justify-between rounded-lg border border-earth-200 px-3 py-2.5 text-left hover:border-primary-400 hover:bg-primary-50"><span><span className="mr-2 text-xs font-semibold text-primary-700">建議 {index + 1}</span><span className="text-sm font-semibold tabular-nums text-earth-900">{item.time}</span></span><span className="text-sm text-earth-700">{item.providerName}</span></button>)}{alternatives.length === 0 ? <p className="text-sm text-earth-500">今天沒有可承接的完整空檔，請改選其他服務或日期。</p> : null}</div></div>}
          </section>

          <section className="rounded-xl border border-earth-200 bg-white p-4">
            <label className="text-sm font-semibold text-earth-900">備註（選填）</label>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={500} placeholder="特殊需求、顧客偏好…" className={`${inputClass} mt-2`} />
          </section>
          {submitError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</p> : null}
        </div>

        <footer className="fixed bottom-0 right-0 z-30 flex w-full max-w-xl items-center justify-between gap-3 border-t border-earth-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 text-xs text-earth-500">預約時不收款；服務完成後再選付款方式</div>
          <button type="button" disabled={!canSubmit || pending} onClick={submit} className="shrink-0 rounded-lg bg-primary-600 px-5 py-3 text-sm font-semibold text-white disabled:bg-earth-300">{pending ? "建立中…" : "確認預約"}</button>
        </footer>
      </aside>
    </div>
  );
}

function QuickCustomerSearch({ value, fallbackLabel, onChange }: { value: string; fallbackLabel: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  useEffect(() => {
    if (value || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/customers/search?q=${encodeURIComponent(query)}&limit=8`, { signal: controller.signal })
        .then(async (response) => response.ok ? response.json() as Promise<CustomerResult[]> : [])
        .then(setResults)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, value]);

  return <div className="relative mt-3"><input value={value ? selectedLabel || fallbackLabel : query} onChange={(event) => { const next = event.target.value; onChange(""); setSelectedLabel(""); setQuery(next); if (next.trim().length < 2) setResults([]); }} placeholder="輸入姓名或電話搜尋" className={inputClass} />{loading ? <span className="absolute right-3 top-3 text-xs text-earth-400">搜尋中…</span> : null}{!value && results.length > 0 ? <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-earth-200 bg-white shadow-xl">{results.map((customer) => <button key={customer.id} type="button" onClick={() => { onChange(customer.id); setSelectedLabel(`${customer.name}（${customer.phone}）`); setResults([]); }} className="flex w-full justify-between px-3 py-3 text-left text-sm hover:bg-primary-50"><span className="font-medium text-earth-900">{customer.name}</span><span className="text-earth-500">{customer.phone}</span></button>)}</div> : null}</div>;
}

const inputClass = "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2.5 text-sm text-earth-800 placeholder:text-earth-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300";
