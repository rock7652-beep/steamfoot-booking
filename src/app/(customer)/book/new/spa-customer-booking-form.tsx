"use client";

import { useMemo, useState, useTransition } from "react";
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
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [bookings, setBookings] = useState(initialBookings);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedTreatments = useMemo(
    () => treatments.filter((treatment) => selectedTreatmentIds.includes(treatment.id)),
    [selectedTreatmentIds, treatments],
  );
  const selectedSlot = availability?.options.find((option) => option.startTime === startTime) ?? null;
  const totalPrice = selectedTreatments.reduce((sum, treatment) => sum + treatment.price, 0);
  const totalMinutes = selectedTreatments.reduce((sum, treatment) => sum + treatment.serviceMinutes, 0);

  function resetSchedule() {
    setAvailability(null);
    setStartTime("");
    setStaffId(null);
    setNotice("");
  }

  function toggleTreatment(id: string) {
    setSelectedTreatmentIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
    resetSchedule();
  }

  function loadAvailability() {
    if (!date || selectedTreatmentIds.length === 0) return;
    startTransition(async () => {
      const result = await fetchSpaCustomerAvailability({ date, treatmentIds: selectedTreatmentIds });
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
      setNotice("預約已取消，原本的人員與服務位置時段已釋放");
    });
  }

  return (
    <div className="space-y-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <section className="rounded-3xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary-700">步驟 1</p>
        <h2 className="mt-1 text-xl font-bold text-earth-900">選擇服務</h2>
        <div className="mt-4 grid gap-3">
          {treatments.map((treatment) => {
            const selected = selectedTreatmentIds.includes(treatment.id);
            return (
              <button
                key={treatment.id}
                type="button"
                onClick={() => toggleTreatment(treatment.id)}
                aria-pressed={selected}
                className={`min-h-16 rounded-2xl border p-4 text-left transition ${selected ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-earth-200 bg-white"}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-earth-900">{treatment.name}</span>
                    <span className="mt-1 block text-sm text-earth-600">
                      {treatment.variantLabel ?? `${treatment.serviceMinutes} 分鐘`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-earth-900">NT${treatment.price.toLocaleString()}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary-700">步驟 2</p>
        <h2 className="mt-1 text-xl font-bold text-earth-900">選擇日期與時間</h2>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {quickDates.map((quickDate) => (
            <button
              key={quickDate}
              type="button"
              onClick={() => { setDate(quickDate); resetSchedule(); }}
              aria-pressed={date === quickDate}
              className={`min-h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold ${date === quickDate ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 bg-white text-earth-700"}`}
            >
              {quickDate.slice(5).replace("-", "/")}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            type="date"
            aria-label="預約日期"
            min={today}
            max={latestDate}
            value={date}
            onChange={(event) => { setDate(event.target.value); resetSchedule(); }}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-earth-300 bg-white px-3 text-base text-earth-900"
          />
          <button
            type="button"
            disabled={isPending || !date || selectedTreatmentIds.length === 0}
            onClick={loadAvailability}
            className="min-h-12 shrink-0 rounded-xl bg-primary-700 px-4 font-semibold text-white disabled:opacity-40"
          >
            {isPending ? "查詢中…" : "查詢時段"}
          </button>
        </div>
        {availability ? (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {availability.options.map((option) => (
              <button
                key={option.startTime}
                type="button"
                onClick={() => { setStartTime(option.startTime); setStaffId(null); setNotice(""); }}
                aria-pressed={startTime === option.startTime}
                className={`min-h-11 rounded-xl border text-sm font-semibold ${startTime === option.startTime ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 text-earth-800"}`}
              >
                {option.startTime}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selectedSlot ? (
        <section className="rounded-3xl bg-white p-5 shadow-[0_8px_28px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary-700">步驟 3</p>
          <h2 className="mt-1 text-xl font-bold text-earth-900">選擇服務人員</h2>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => setStaffId(null)}
              aria-pressed={staffId === null}
              className={`min-h-12 rounded-xl border px-4 text-left font-semibold ${staffId === null ? "border-primary-600 bg-primary-50 text-primary-900" : "border-earth-200 text-earth-800"}`}
            >
              不指定（由系統安排）
            </button>
            {selectedSlot.providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => setStaffId(provider.id)}
                aria-pressed={staffId === provider.id}
                className={`min-h-12 rounded-xl border px-4 text-left font-semibold ${staffId === provider.id ? "border-primary-600 bg-primary-50 text-primary-900" : "border-earth-200 text-earth-800"}`}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {selectedSlot ? (
        <section className="rounded-3xl bg-earth-900 p-5 text-white shadow-lg">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary-200">步驟 4</p>
          <h2 className="mt-1 text-xl font-bold">確認預約</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-earth-200">日期時間</dt><dd className="text-right font-semibold">{date} {startTime}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-earth-200">服務</dt><dd className="text-right font-semibold">{selectedTreatments.map((item) => item.name).join("＋")}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-earth-200">服務人員</dt><dd className="text-right font-semibold">{staffId ? selectedSlot.providers.find((person) => person.id === staffId)?.name : "不指定"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-earth-200">預估</dt><dd className="text-right font-semibold">{totalMinutes} 分鐘・NT${totalPrice.toLocaleString()}</dd></div>
          </dl>
          <button
            type="button"
            disabled={isPending}
            onClick={submitBooking}
            className="mt-5 min-h-12 w-full rounded-2xl bg-primary-600 px-5 text-base font-bold text-white disabled:opacity-50"
          >
            {isPending ? "送出中…" : "確認送出預約"}
          </button>
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
    </div>
  );
}
