"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormSection } from "@/components/desktop";
import { formatWeekdayZh } from "@/lib/date-utils";
import {
  fetchSpaBookingAvailability,
  type SpaBookingAvailability,
} from "@/server/actions/spa-booking-availability";
import { useBookingFormValidation } from "./booking-create-form";

export type SpaBookingTreatmentOption = {
  id: string;
  name: string;
  variantLabel: string | null;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
};

export function SpaBookingFields({
  days,
  defaultDate,
  treatments,
  defaultServiceStaffId,
  defaultSlotTime,
}: {
  days: readonly string[];
  defaultDate: string;
  treatments: readonly SpaBookingTreatmentOption[];
  defaultServiceStaffId?: string;
  defaultSlotTime?: string;
}) {
  const { errors, clearError } = useBookingFormValidation();
  const initialDate = days.includes(defaultDate) ? defaultDate : (days[0] ?? "");
  const [date, setDate] = useState(initialDate);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [availability, setAvailability] = useState<SpaBookingAvailability | null>(null);
  const [providerId, setProviderId] = useState(defaultServiceStaffId ?? "");
  const [slotTime, setSlotTime] = useState(defaultSlotTime ?? "");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const selectedTreatments = useMemo(
    () => treatments.filter((treatment) => selectedIds.includes(treatment.id)),
    [selectedIds, treatments],
  );
  const clientSummary = useMemo(
    () => ({
      serviceMinutes: selectedTreatments.reduce(
        (sum, treatment) => sum + treatment.serviceMinutes,
        0,
      ),
      bufferMinutes: selectedTreatments.reduce(
        (sum, treatment) => sum + treatment.bufferMinutes,
        0,
      ),
      totalPrice: selectedTreatments.reduce(
        (sum, treatment) => sum + treatment.price,
        0,
      ),
    }),
    [selectedTreatments],
  );

  useEffect(() => {
    if (!date || selectedIds.length === 0) {
      return;
    }
    const requestId = ++requestIdRef.current;
    void fetchSpaBookingAvailability({ date, treatmentIds: selectedIds })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        if (!result.success) {
          setAvailability(null);
          setLoadError(result.error || "暫時無法計算可預約時間");
          return;
        }
        setAvailability(result.data);
        const availableProviders = result.data.providers.filter(
          (provider) => provider.startTimes.length > 0,
        );
        const nextProviderId =
          defaultServiceStaffId &&
          availableProviders.some((provider) => provider.id === defaultServiceStaffId)
            ? defaultServiceStaffId
            : (availableProviders[0]?.id ?? "");
        setProviderId(nextProviderId);
        const nextProvider = availableProviders.find(
          (provider) => provider.id === nextProviderId,
        );
        setSlotTime(
          defaultSlotTime && nextProvider?.startTimes.includes(defaultSlotTime)
            ? defaultSlotTime
            : "",
        );
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setAvailability(null);
          setLoadError("暫時無法計算可預約時間");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [date, selectedIds, defaultServiceStaffId, defaultSlotTime]);

  const selectedProvider = availability?.providers.find(
    (provider) => provider.id === providerId,
  );

  function toggleTreatment(id: string) {
    clearError("treatment");
    clearError("slot");
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selectedId) => selectedId !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    if (next.length === 0) {
      requestIdRef.current += 1;
      setAvailability(null);
      setProviderId(defaultServiceStaffId ?? "");
      setLoadError(null);
      setLoading(false);
    } else {
      setLoading(true);
      setLoadError(null);
    }
    setSlotTime("");
  }

  const availableProviderCount =
    availability?.providers.filter((provider) => provider.startTimes.length > 0).length ?? 0;

  return (
    <>
      <input type="hidden" name="spaMode" value="on" />
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="treatmentIds" value={id} />
      ))}

      <FormSection
        title="本次服務"
        description="可複選，系統會自動累加時間與需要的專業"
      >
        <div data-booking-treatment-section tabIndex={-1} className="space-y-2">
          {treatments.map((treatment) => {
            const selected = selectedIds.includes(treatment.id);
            return (
              <button
                key={treatment.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTreatment(treatment.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition ${
                  selected
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
                    : "border-earth-200 bg-white hover:border-primary-300 hover:bg-earth-50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                      selected
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-earth-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-earth-900">
                      {treatment.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-earth-500">
                      {treatment.variantLabel ?? `${treatment.serviceMinutes} 分鐘`}
                      {treatment.bufferMinutes > 0
                        ? `・整理 ${treatment.bufferMinutes} 分鐘`
                        : ""}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-earth-700">
                  NT${treatment.price.toLocaleString("zh-TW")}
                </span>
              </button>
            );
          })}
        </div>

        {errors.treatment && (
          <p className="text-sm text-red-600" role="alert">
            {errors.treatment}
          </p>
        )}

        {selectedIds.length > 0 && (
          <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary-900">
                已選 {selectedIds.length} 項服務
              </p>
              <p className="text-sm font-semibold tabular-nums text-primary-900">
                NT${clientSummary.totalPrice.toLocaleString("zh-TW")}
              </p>
            </div>
            <p className="mt-1 text-xs text-primary-800">
              服務 {clientSummary.serviceMinutes} 分鐘＋整理 {clientSummary.bufferMinutes} 分鐘
              ＝占用 {clientSummary.serviceMinutes + clientSummary.bufferMinutes} 分鐘
            </p>
          </div>
        )}
      </FormSection>

      <FormSection
        title="安排時間"
        description="只顯示專業符合且有完整連續空檔的人員與時段"
      >
        <div>
          <label className="block text-sm font-medium text-earth-700">
            日期 <span className="text-red-500">*</span>
          </label>
          <select
            name="bookingDate"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSlotTime("");
              if (selectedIds.length > 0) {
                setLoading(true);
                setLoadError(null);
              }
              clearError("slot");
            }}
            className="mt-1.5 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {day}（{formatWeekdayZh(day)}）
              </option>
            ))}
          </select>
        </div>

        {selectedIds.length === 0 ? (
          <p className="rounded-lg bg-earth-50 px-4 py-4 text-center text-sm text-earth-500">
            先選本次服務，系統才會計算可預約的人員與時間。
          </p>
        ) : loading ? (
          <p className="rounded-lg bg-earth-50 px-4 py-4 text-center text-sm text-earth-500">
            正在比對專業、班表與連續空檔…
          </p>
        ) : loadError ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : availability && availableProviderCount === 0 ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            這一天沒有同時具備所需專業與完整 {availability.occupiedMinutes} 分鐘空檔的人員。
          </p>
        ) : availability ? (
          <>
            <div>
              <label className="block text-sm font-medium text-earth-700">服務人員</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {availability.providers
                  .filter((provider) => provider.startTimes.length > 0)
                  .map((provider, index) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => {
                        setProviderId(provider.id);
                        setSlotTime("");
                        clearError("slot");
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        providerId === provider.id
                          ? "border-primary-600 bg-primary-600 text-white"
                          : "border-earth-200 bg-white text-earth-700 hover:border-primary-300"
                      }`}
                    >
                      {index === 0 ? "推薦・" : ""}{provider.displayName}
                    </button>
                  ))}
              </div>
            </div>

            <div data-booking-slot-section tabIndex={-1}>
              <label className="block text-sm font-medium text-earth-700">
                開始時間 <span className="text-red-500">*</span>
              </label>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {(selectedProvider?.startTimes ?? []).map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => {
                      setSlotTime(time);
                      clearError("slot");
                    }}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-medium tabular-nums ${
                      slotTime === time
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-earth-200 bg-white text-earth-700 hover:border-primary-400 hover:bg-primary-50"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
              {errors.slot && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {errors.slot}
                </p>
              )}
            </div>
          </>
        ) : null}

        <input type="hidden" name="people" value="1" />
        <input type="hidden" name="serviceStaffId" value={providerId} />
        <input type="hidden" name="slotTime" value={slotTime} />
      </FormSection>
    </>
  );
}
