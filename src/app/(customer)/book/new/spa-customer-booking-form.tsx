"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  cancelSpaCustomerBooking,
  createSpaCustomerBooking,
  fetchSpaCustomerAvailability,
  type SpaCustomerAvailability,
} from "@/server/actions/spa-customer-booking";

type Treatment = {
  id: string;
  name: string;
  variantLabel: string | null;
  price: number;
  serviceMinutes: number;
};

type Booking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  staffName: string;
  locationName: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
};

function newRequestKey() {
  return crypto.randomUUID();
}

export function SpaCustomerBookingForm({
  treatments,
  initialBookings,
  today,
  latestDate,
  quickDates,
}: {
  treatments: Treatment[];
  initialBookings: Booking[];
  today: string;
  latestDate: string;
  quickDates: string[];
}) {
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [availability, setAvailability] = useState<SpaCustomerAvailability | null>(null);
  const [startTime, setStartTime] = useState("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffChoiceMade, setStaffChoiceMade] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [bookings, setBookings] = useState(initialBookings);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const availabilityRequestRef = useRef(0);

  const selectedTreatments = useMemo(
    () => treatments.filter((treatment) => selectedTreatmentIds.includes(treatment.id)),
    [selectedTreatmentIds, treatments],
  );
  const selectedSlot = availability?.options.find((option) => option.startTime === startTime) ?? null;
  const totalPrice = selectedTreatments.reduce((sum, treatment) => sum + treatment.price, 0);
  const totalMinutes = selectedTreatments.reduce((sum, treatment) => sum + treatment.serviceMinutes, 0);
  const selectedStaffName = staffId
    ? selectedSlot?.providers.find((person) => person.id === staffId)?.name ?? "服務人員"
    : "不指定";
  const timeGroups = useMemo(() => {
    const options = availability?.options ?? [];
    return [
      { label: "上午", options: options.filter((option) => option.startTime < "12:00") },
      { label: "下午", options: options.filter((option) => option.startTime >= "12:00" && option.startTime < "18:00") },
      { label: "晚上", options: options.filter((option) => option.startTime >= "18:00") },
    ].filter((group) => group.options.length > 0);
  }, [availability]);
  const primaryDisabled =
    isPending ||
    (activeStep === 1 && selectedTreatmentIds.length === 0) ||
    (activeStep === 2 && !selectedSlot) ||
    (activeStep === 3 && !staffChoiceMade);
  const primaryLabel = isPending
    ? activeStep === 4
      ? "送出中…"
      : "處理中…"
    : activeStep === 1
      ? "選擇日期時間"
      : activeStep === 2
        ? "選擇服務人員"
        : activeStep === 3
          ? "確認預約"
          : "送出預約";

  function resetSchedule() {
    availabilityRequestRef.current += 1;
    setAvailability(null);
    setStartTime("");
    setStaffId(null);
    setStaffChoiceMade(false);
    setNotice("");
  }

  function toggleTreatment(id: string) {
    setSelectedTreatmentIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
    resetSchedule();
  }

  function loadAvailability(nextDate: string) {
    if (!nextDate || selectedTreatmentIds.length === 0) return;
    const requestId = availabilityRequestRef.current + 1;
    availabilityRequestRef.current = requestId;
    startTransition(async () => {
      const result = await fetchSpaCustomerAvailability({
        date: nextDate,
        treatmentIds: selectedTreatmentIds,
      });
      if (requestId !== availabilityRequestRef.current) return;
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setAvailability(result.data);
      setStartTime("");
      setStaffId(null);
      setNotice(result.data.options.length ? "" : "這一天目前沒有可預約時段");
    });
  }

  function chooseDate(nextDate: string) {
    setDate(nextDate);
    resetSchedule();
    loadAvailability(nextDate);
  }

  function chooseSlot(nextStartTime: string) {
    setStartTime(nextStartTime);
    setStaffId(null);
    setStaffChoiceMade(false);
    setNotice("");
    setActiveStep(3);
  }

  function chooseStaff(nextStaffId: string | null) {
    setStaffId(nextStaffId);
    setStaffChoiceMade(true);
    setNotice("");
    setActiveStep(4);
  }

  function handlePrimaryAction() {
    if (activeStep === 1 && selectedTreatmentIds.length > 0) {
      setActiveStep(2);
      return;
    }
    if (activeStep === 2 && selectedSlot) {
      setActiveStep(3);
      return;
    }
    if (activeStep === 3 && staffChoiceMade) {
      setActiveStep(4);
      return;
    }
    if (activeStep === 4) submitBooking();
  }

  function submitBooking() {
    if (!date || !startTime || selectedTreatmentIds.length === 0) return;
    startTransition(async () => {
      const result = await createSpaCustomerBooking({
        date,
        startTime,
        treatmentIds: selectedTreatmentIds,
        staffId,
        requestKey,
      });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      const created: Booking = {
        id: result.data.bookingId,
        date,
        startTime,
        endTime: result.data.endTime,
        serviceName: result.data.serviceName,
        staffName: result.data.staffName,
        locationName: result.data.locationName,
        status: "CONFIRMED",
      };
      setBookings((current) => [created, ...current.filter((booking) => booking.id !== created.id)]);
      setNotice("預約成功，店長與服務人員會同步看到這筆安排");
      setRequestKey(newRequestKey());
    });
  }

  function cancelBooking(bookingId: string) {
    startTransition(async () => {
      const result = await cancelSpaCustomerBooking({ bookingId });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      setBookings((current) =>
        current.map((booking) => booking.id === bookingId ? { ...booking, status: "CANCELLED" } : booking),
      );
      setCancelTargetId(null);
      setAvailability(null);
      setStartTime("");
      setStaffId(null);
      setStaffChoiceMade(false);
      setNotice("預約已取消，原本的人員與服務位置時段已釋放");
    });
  }

  return (
    <div className="space-y-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))]">
      <ol aria-label="預約進度" className="grid grid-cols-4 gap-1 rounded-2xl bg-white p-2 text-center text-[11px] font-semibold shadow-sm ring-1 ring-earth-200/70">
        {["服務", "日期時間", "人員", "確認"].map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3 | 4;
          return (
            <li key={label} aria-current={activeStep === step ? "step" : undefined} className={`rounded-xl px-1 py-2 ${activeStep === step ? "bg-primary-700 text-white" : activeStep > step ? "bg-primary-50 text-primary-800" : "text-earth-400"}`}>
              {label}
            </li>
          );
        })}
      </ol>

      {activeStep > 1 ? (
        <StepSummary label="服務" value={`${selectedTreatments.map((item) => item.name).join("＋")}・${totalMinutes} 分・NT$${totalPrice.toLocaleString()}`} onEdit={() => { setActiveStep(1); resetSchedule(); }} />
      ) : (
        <section className="rounded-3xl bg-white p-4 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
          <h2 className="text-lg font-bold text-earth-900">選擇服務</h2>
          <div className="mt-3 divide-y divide-earth-100 overflow-hidden rounded-2xl border border-earth-200">
            {treatments.map((treatment) => {
              const selected = selectedTreatmentIds.includes(treatment.id);
              return (
                <button key={treatment.id} type="button" onClick={() => toggleTreatment(treatment.id)} aria-pressed={selected} className={`flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition ${selected ? "bg-primary-50" : "bg-white"}`}>
                  <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-primary-700 bg-primary-700 text-white" : "border-earth-300"}`}>{selected ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-earth-900">{treatment.name}</span>
                    {treatment.variantLabel ? <span className="block truncate text-xs text-earth-500">{treatment.variantLabel}</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-xs text-earth-600"><span className="block">{treatment.serviceMinutes} 分</span><span className="font-semibold text-earth-800">NT${treatment.price.toLocaleString()}</span></span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {activeStep > 2 ? (
        <StepSummary label="日期時間" value={`${date}・${startTime}`} onEdit={() => { setActiveStep(2); setStartTime(""); setStaffId(null); setStaffChoiceMade(false); }} />
      ) : activeStep === 2 ? (
        <section className="rounded-3xl bg-white p-4 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
          <h2 className="text-lg font-bold text-earth-900">選擇日期與時間</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {quickDates.map((quickDate) => (
              <button key={quickDate} type="button" onClick={() => chooseDate(quickDate)} aria-pressed={date === quickDate} className={`min-h-10 shrink-0 rounded-xl border px-3 text-sm font-semibold ${date === quickDate ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 bg-white text-earth-700"}`}>
                {quickDate.slice(5).replace("-", "/")}
              </button>
            ))}
          </div>
          <input type="date" aria-label="預約日期" min={today} max={latestDate} value={date} onChange={(event) => chooseDate(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-earth-300 bg-white px-3 text-base text-earth-900" />
          {isPending && date ? <p className="mt-4 text-center text-sm text-earth-500" role="status">正在查詢可預約時段…</p> : null}
          {!isPending && timeGroups.map((group) => (
            <fieldset key={group.label} className="mt-4">
              <legend className="text-xs font-semibold text-earth-500">{group.label}</legend>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {group.options.map((option) => (
                  <button key={option.startTime} type="button" onClick={() => chooseSlot(option.startTime)} aria-pressed={startTime === option.startTime} className={`min-h-10 rounded-xl border text-sm font-semibold ${startTime === option.startTime ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 bg-white text-earth-800"}`}>
                    {option.startTime}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      ) : null}

      {activeStep > 3 ? (
        <StepSummary label="服務人員" value={selectedStaffName} onEdit={() => setActiveStep(3)} />
      ) : activeStep === 3 && selectedSlot ? (
        <section className="rounded-3xl bg-white p-4 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
          <h2 className="text-lg font-bold text-earth-900">選擇服務人員</h2>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={() => chooseStaff(null)} aria-pressed={staffChoiceMade && staffId === null} className={`min-h-11 rounded-xl border px-4 text-left text-sm font-semibold ${staffChoiceMade && staffId === null ? "border-primary-600 bg-primary-50 text-primary-900" : "border-earth-200 text-earth-800"}`}>不指定（由系統安排）</button>
            {selectedSlot.providers.map((provider) => (
              <button key={provider.id} type="button" onClick={() => chooseStaff(provider.id)} aria-pressed={staffId === provider.id} className={`min-h-11 rounded-xl border px-4 text-left text-sm font-semibold ${staffId === provider.id ? "border-primary-600 bg-primary-50 text-primary-900" : "border-earth-200 text-earth-800"}`}>
                {provider.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeStep === 4 && selectedSlot && staffChoiceMade ? (
        <section className="rounded-3xl bg-earth-900 p-5 text-white shadow-lg">
          <h2 className="text-xl font-bold">確認預約</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-earth-200">日期時間</dt><dd className="text-right font-semibold">{date} {startTime}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-earth-200">服務</dt><dd className="text-right font-semibold">{selectedTreatments.map((item) => item.name).join("＋")}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-earth-200">服務人員</dt><dd className="text-right font-semibold">{selectedStaffName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-earth-200">預估</dt><dd className="text-right font-semibold">{totalMinutes} 分鐘・NT${totalPrice.toLocaleString()}</dd></div>
          </dl>
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-2xl bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-900" aria-live="polite">{notice}</p>
      ) : null}

      {bookings.length > 0 ? (
        <section className="rounded-3xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
          <h2 className="text-xl font-bold text-earth-900">我的 SPA 預約</h2>
          <div className="mt-4 space-y-3">
            {bookings.map((booking) => (
              <article key={booking.id} className="rounded-2xl bg-earth-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-earth-900">{booking.date}・{booking.startTime}–{booking.endTime}</p>
                    <p className="mt-1 text-sm text-earth-700">{booking.serviceName}</p>
                    <p className="mt-1 text-xs text-earth-600">{booking.staffName}・{booking.locationName}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-earth-600">
                    {booking.status === "CANCELLED" ? "已取消" : "已確認"}
                  </span>
                </div>
                {booking.status !== "CANCELLED" ? (
                  cancelTargetId === booking.id ? (
                    <div className="mt-3 rounded-xl bg-[#fbf2ef] p-3">
                      <p className="text-sm font-semibold text-earth-900">確定取消這筆預約？</p>
                      <p className="mt-1 text-xs text-earth-600">取消會保留歷史紀錄，並釋放人員與服務位置。</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setCancelTargetId(null)} className="min-h-11 rounded-xl border border-earth-200 bg-white text-sm font-semibold text-earth-700">保留預約</button>
                        <button type="button" disabled={isPending} onClick={() => cancelBooking(booking.id)} className="min-h-11 rounded-xl bg-[#9a5d4d] text-sm font-semibold text-white disabled:opacity-50">確認取消</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setCancelTargetId(booking.id)}
                      className="mt-3 min-h-11 w-full rounded-xl border border-[#b98575] bg-white px-4 text-sm font-semibold text-[#855649] disabled:opacity-50"
                    >
                      取消這筆預約
                    </button>
                  )
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-earth-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(52,47,39,0.1)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-earth-800">
              {selectedTreatments.length
                ? selectedTreatments.map((item) => item.name).join("＋")
                : "尚未選擇服務"}
            </p>
            <p className="mt-0.5 truncate text-xs text-earth-500">
              {date && startTime
                ? `${date} ${startTime}${staffChoiceMade ? `・${selectedStaffName}` : ""}`
                : `${totalMinutes || 0} 分・NT$${totalPrice.toLocaleString()}`}
            </p>
          </div>
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={handlePrimaryAction}
            className="min-h-12 shrink-0 rounded-2xl bg-primary-700 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepSummary({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-earth-200/70"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-primary-700">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-earth-900">{value}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-primary-700">修改</span>
    </button>
  );
}
