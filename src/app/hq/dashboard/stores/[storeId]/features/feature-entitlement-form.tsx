"use client";

import { useActionState, type ReactNode } from "react";
import { getStoreFeatureSourceLabel } from "@/lib/store-feature-catalog";
import {
  saveStoreFeatureEntitlementAction,
  type StoreFeatureEntitlementFormState,
} from "@/server/actions/store-feature-entitlement";

type FeatureEntitlementFormProps = {
  storeId: string;
  featureKey: string;
  override: "INHERIT" | "ENABLED" | "DISABLED";
  source: "ADDON" | "MANUAL" | "PROMO" | "HQ_OVERRIDE";
  startsAt: string;
  expiresAt: string;
  note: string;
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
}: FeatureEntitlementFormProps) {
  const [state, action, pending] = useActionState(
    saveStoreFeatureEntitlementAction,
    initialState,
  );

  return (
    <form
      action={action}
      className="grid gap-3 rounded-md border border-earth-100 bg-earth-50/40 p-3"
    >
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="featureKey" value={featureKey} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="單店覆寫" htmlFor={`${featureKey}-override`}>
          <select
            id={`${featureKey}-override`}
            name="override"
            defaultValue={override}
            className="h-10 w-full rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
          >
            <option value="INHERIT">跟隨方案</option>
            <option value="ENABLED">強制開啟</option>
            <option value="DISABLED">強制關閉</option>
          </select>
        </Field>

        <Field label="來源" htmlFor={`${featureKey}-source`}>
          <select
            id={`${featureKey}-source`}
            name="source"
            defaultValue={source}
            className="h-10 w-full rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
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
            className="h-10 w-full rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
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
            className="h-10 w-full rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px]">
        <Field label="備註" htmlFor={`${featureKey}-note`}>
          <input
            id={`${featureKey}-note`}
            name="note"
            defaultValue={note}
            className="h-10 w-full rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
            placeholder="HQ 內部備註"
          />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-primary-600 px-3 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
        >
          {pending ? "儲存中" : "儲存"}
        </button>
      </div>

      {(state.error || state.success) && (
        <p
          className={`rounded-md px-2 py-1 text-xs ${
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
      <span className="text-[11px] font-medium text-earth-500">{label}</span>
      {children}
      {help && <span className="text-[11px] leading-snug text-earth-400">{help}</span>}
    </label>
  );
}
