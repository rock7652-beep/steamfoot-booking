"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { getStoreFeatureSourceLabel } from "@/lib/store-feature-catalog";
import {
  saveStoreFeatureEntitlementAction,
  type StoreFeatureEntitlementFormState,
} from "@/server/actions/store-feature-entitlement";

export type FeatureEntitlementFormProps = {
  storeId: string;
  featureKey: string;
  override: "INHERIT" | "ENABLED" | "DISABLED" | "LOCKED" | "HIDDEN";
  source: "ADDON" | "MANUAL" | "PROMO" | "HQ_OVERRIDE";
  startsAt: string;
  expiresAt: string;
  note: string;
  onEditState?: (state: { dirty: boolean; pending: boolean }) => void;
};

const initialState: StoreFeatureEntitlementFormState = {
  success: null,
  error: null,
};

const SOURCE_OPTIONS = ["ADDON", "MANUAL", "PROMO", "HQ_OVERRIDE"] as const;

export function FeatureEntitlementForm({
  storeId,
  featureKey,
  override,
  source,
  startsAt,
  expiresAt,
  note,
  onEditState,
}: FeatureEntitlementFormProps) {
  const [state, action, pending] = useActionState(
    saveStoreFeatureEntitlementAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const lastResult = useRef(state);
  useEffect(() => {
    if (!formRef.current) return;
    const value = JSON.stringify([...new FormData(formRef.current).entries()].filter(([key]) => !key.startsWith("$ACTION")));
    if (baseline.current === null || (state !== lastResult.current && state.success)) baseline.current = value;
    lastResult.current = state;
    onEditState?.({ dirty: value !== baseline.current, pending });
  }, [state, pending, onEditState]);

  const isAnalysis = featureKey === "basic_reports";

  return (
    <form
      ref={formRef}
      action={action}
      onChange={() => {
        if (!formRef.current) return;
        const value = JSON.stringify([...new FormData(formRef.current).entries()].filter(([key]) => !key.startsWith("$ACTION")));
        onEditState?.({ dirty: value !== baseline.current, pending });
      }}
      className="grid gap-3 rounded-md border border-earth-100 bg-earth-50/40 p-3"
    >
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="featureKey" value={featureKey} />
      <fieldset disabled={pending} className="contents">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={isAnalysis ? "分析功能" : "單店覆寫"} htmlFor={`${featureKey}-override`}>
          <select
            id={`${featureKey}-override`}
            name="override"
            defaultValue={override === "DISABLED" ? "LOCKED" : override}
            className="min-h-11 w-full rounded-md border border-earth-200 bg-white px-2 text-sm text-earth-800 focus:border-primary-500 focus:outline-none"
          >
            <option value="INHERIT">跟隨方案</option>
            <option value="ENABLED">啟用</option>
            <option value="LOCKED">鎖定 · 顯示入口，無法使用</option>
            <option value="HIDDEN">隱藏 · 不顯示入口</option>
          </select>
        </Field>

        <Field label="來源" htmlFor={`${featureKey}-source`}>
          <select
            id={`${featureKey}-source`}
            name="source"
            defaultValue={source}
            className="min-h-11 w-full rounded-md border border-earth-200 bg-white px-2 text-sm text-earth-800 focus:border-primary-500 focus:outline-none"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {getStoreFeatureSourceLabel(option)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="開始日"
          htmlFor={`${featureKey}-startsAt`}
          help="空白代表立即生效"
        >
          <input
            id={`${featureKey}-startsAt`}
            name="startsAt"
            type="date"
            defaultValue={startsAt}
            className="min-h-11 w-full rounded-md border border-earth-200 bg-white px-2 text-sm text-earth-800 focus:border-primary-500 focus:outline-none"
          />
        </Field>

        <Field
          label="結束日"
          htmlFor={`${featureKey}-expiresAt`}
          help="空白代表不設定到期日"
        >
          <input
            id={`${featureKey}-expiresAt`}
            name="expiresAt"
            type="date"
            defaultValue={expiresAt}
            className="min-h-11 w-full rounded-md border border-earth-200 bg-white px-2 text-sm text-earth-800 focus:border-primary-500 focus:outline-none"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px]">
        <Field label="備註" htmlFor={`${featureKey}-note`}>
          <input
            id={`${featureKey}-note`}
            name="note"
            defaultValue={note}
            className="min-h-11 w-full rounded-md border border-earth-200 bg-white px-2 text-sm text-earth-800 focus:border-primary-500 focus:outline-none"
            placeholder="HQ 內部備註"
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
        >
          {pending ? "儲存中" : "儲存"}
        </button>
      </div>
      </fieldset>
      {(state.error || state.success) && (
        <p
          className={`rounded-md px-2 py-1 text-sm ${
            state.error
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1" htmlFor={htmlFor}>
      <span className="text-sm font-medium text-earth-500">{label}</span>
      {children}
      {help && <span className="text-sm leading-snug text-earth-400">{help}</span>}
    </label>
  );
}
