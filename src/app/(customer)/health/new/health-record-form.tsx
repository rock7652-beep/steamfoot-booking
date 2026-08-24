"use client";

import { useActionState } from "react";
import {
  initialSaveCustomerHealthRecordState,
  saveCustomerHealthRecord,
} from "@/server/actions/customer-health-record";

const fields = [
  ["weight", "體重", "kg", "0.1"],
  ["bmi", "BMI", "", "0.1"],
  ["bodyFat", "體脂肪", "%", "0.1"],
  ["muscleMass", "肌肉量", "kg", "0.1"],
  ["boneMass", "骨量", "kg", "0.1"],
  ["visceralFat", "內臟脂肪", "", "1"],
  ["bmr", "基礎代謝", "kcal", "1"],
  ["bodyWater", "體水分", "%", "0.1"],
  ["metabolicAge", "體內年齡", "歲", "1"],
] as const;

export function HealthRecordForm({ requestId, today }: { requestId: string; today: string }) {
  const [state, action, pending] = useActionState(
    saveCustomerHealthRecord,
    initialSaveCustomerHealthRecordState,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      {state.error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
        <label htmlFor="measuredAt" className="block text-sm font-semibold text-earth-900">
          量測日期
        </label>
        <input
          id="measuredAt"
          name="measuredAt"
          type="date"
          defaultValue={today}
          max={today}
          required
          className="mt-2 min-h-[52px] w-full rounded-xl border border-earth-200 px-4 text-base text-earth-900"
        />
        <FieldError messages={state.fieldErrors?.measuredAt} />

        <div className="mt-5 grid grid-cols-2 gap-3">
          {fields.map(([name, label, unit, step]) => (
            <div key={name}>
              <label htmlFor={name} className="block text-sm font-semibold text-earth-900">
                {label}
              </label>
              <div className="relative mt-2">
                <input
                  id={name}
                  name={name}
                  type="number"
                  inputMode="decimal"
                  step={step}
                  className="min-h-[52px] w-full rounded-xl border border-earth-200 px-4 pr-12 text-base text-earth-900"
                />
                {unit && <span className="absolute right-3 top-4 text-sm text-earth-500">{unit}</span>}
              </div>
              <FieldError messages={state.fieldErrors?.[name]} />
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-earth-500">
          BMI 可直接填入量測儀器數值；未填時，系統會在有身高與體重資料時自動計算。
        </p>

        <label htmlFor="note" className="mt-5 block text-sm font-semibold text-earth-900">
          備註（選填）
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          placeholder="例如：蒸足前量測"
          className="mt-2 w-full rounded-xl border border-earth-200 px-4 py-3 text-base text-earth-900"
        />
        <FieldError messages={state.fieldErrors?.note} />
      </section>

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "正在儲存…" : "儲存並查看評估"}
      </button>
      <p className="text-center text-xs leading-relaxed text-earth-500">
        健康評估為日常追蹤參考，不能取代醫療診斷；若身體不適請諮詢專業醫療人員。
      </p>
    </form>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{messages[0]}</p>;
}
