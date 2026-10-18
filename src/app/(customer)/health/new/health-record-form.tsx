"use client";

import { useActionState, useEffect } from "react";
import {
  saveCustomerHealthRecord,
  type SaveCustomerHealthRecordState,
} from "@/server/actions/customer-health-record";
import { saveLiffHealthRecord } from "@/server/actions/liff-health";
import { updateLiffHealthRecord } from "@/server/actions/liff-health";
import type { HealthRecord } from "@/lib/health-service";

const initialSaveCustomerHealthRecordState: SaveCustomerHealthRecordState = {
  error: null,
};

const fields = [
  ["visceralFat", "內臟脂肪", "", "0.5"],
  ["weight", "體重", "kg", "0.1"],
  ["bmi", "BMI", "", "0.1"],
  ["bodyFat", "體脂肪", "%", "0.1"],
  ["muscleMass", "肌肉量", "kg", "0.1"],
  ["boneMass", "骨量", "kg", "0.1"],
  ["bmr", "基礎代謝", "kcal", "1"],
  ["metabolicAge", "體內年齡", "歲", "1"],
  ["bodyWater", "體水分", "%", "0.1"],
] as const;

export function HealthRecordForm({
  compact=false,
  requestId,
  today,
  storeSlug,
  surface = "web",
  mode = "create",
  recordId,
  initialValues,
  submitAction: customAction,
  onSaved,
  notePlaceholder = "例如：蒸足前量測",
}: {
  compact?:boolean; requestId: string;
  today: string;
  storeSlug?: string;
  surface?: "web" | "liff";
  mode?: "create" | "edit";
  recordId?: string;
  initialValues?: HealthRecord;
  submitAction?: (state: SaveCustomerHealthRecordState, data: FormData) => Promise<SaveCustomerHealthRecordState>;
  onSaved?: () => void;
  notePlaceholder?: string;
}) {
  const submitAction = customAction ?? (
    surface === "liff" && mode === "edit"
      ? updateLiffHealthRecord
      : surface === "liff"
        ? saveLiffHealthRecord
        : saveCustomerHealthRecord);
  const [state, action, pending] = useActionState(
    submitAction,
    initialSaveCustomerHealthRecordState,
  );

  useEffect(() => {
    if ("saved" in state && state.saved === true) onSaved?.();
  }, [state, onSaved]);

  return (
    <form action={action} className={compact?"space-y-3 @container":"space-y-5"}>
      <input type="hidden" name="requestId" value={requestId} />
      {recordId && <input type="hidden" name="recordId" value={recordId} />}
      {surface === "liff" && <input type="hidden" name="storeSlug" value={storeSlug} />}
      {state.error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <section className={compact?"grid grid-cols-2 items-start gap-x-3 gap-y-2 @[620px]:grid-cols-3 @[780px]:grid-cols-4":"rounded-2xl border border-earth-200 bg-white p-5 shadow-sm"}>
        <div>
        <label htmlFor="measuredAt" className="block text-sm font-semibold text-earth-900">
          量測日期
        </label>
        <span className="mt-2 block w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-earth-200">
          <input
            id="measuredAt"
            name="measuredAt"
            type="date"
            defaultValue={initialValues?.measuredAt ?? today}
            max={today}
            required
            className={compact?"block min-h-11 w-full min-w-0 max-w-full appearance-none border-0 bg-white px-3 text-base text-earth-900":"block min-h-[52px] w-full min-w-0 max-w-full appearance-none border-0 bg-white px-4 text-base text-earth-900"}
          />
        </span>
        <FieldError messages={state.fieldErrors?.measuredAt} />

        </div><div className={compact?"contents":"mt-5 grid grid-cols-2 gap-3"}>
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
                  defaultValue={initialValues?.[name] ?? ""}
                  className={compact?"min-h-11 w-full min-w-0 rounded-lg border border-earth-200 px-3 pr-12 text-base text-earth-900":"min-h-[52px] w-full rounded-xl border border-earth-200 px-4 pr-12 text-base text-earth-900"}
                />
                {unit && <span className="absolute right-3 top-4 text-sm text-earth-500">{unit}</span>}
              </div>
              <FieldError messages={state.fieldErrors?.[name]} />
            </div>
          ))}
        </div>

        {!compact&&<p className="mt-3 text-xs leading-relaxed text-earth-500">
          BMI 可直接填入量測儀器數值；內臟脂肪可填入 4.5 等半級數值。BMI 未填時，系統會在有身高與體重資料時自動計算。
        </p>}

        <div className={compact?"col-span-full":""}><label htmlFor="note" className={`${compact?"":"mt-5"} block text-sm font-semibold text-earth-900`}>
          備註（選填）
        </label>
        <textarea
          id="note"
          name="note"
          rows={compact?1:3}
          maxLength={500}
          placeholder={notePlaceholder}
          className={compact?"mt-1 !min-h-11 !h-11 w-full rounded-lg border border-earth-200 px-3 py-2 text-base text-earth-900":"mt-2 w-full rounded-xl border border-earth-200 px-4 py-3 text-base text-earth-900"}
          defaultValue={initialValues?.note ?? ""}
        />
        <FieldError messages={state.fieldErrors?.note} /></div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className={`${compact?"min-h-11 ml-auto w-auto":"min-h-[52px] w-full"} flex items-center justify-center rounded-lg bg-primary-600 px-5 text-base font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-70`}
      >
        {pending
          ? "正在儲存…"
          : mode === "edit"
            ? "儲存修改"
            : "儲存並查看評估"}
      </button>
      {!compact&&<p className="text-center text-xs leading-relaxed text-earth-500">
        健康評估為日常追蹤參考，不能取代醫療診斷；若身體不適請諮詢專業醫療人員。
      </p>}
    </form>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{messages[0]}</p>;
}
