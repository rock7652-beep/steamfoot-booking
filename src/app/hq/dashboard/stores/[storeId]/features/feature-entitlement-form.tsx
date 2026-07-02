"use client";

import { useActionState } from "react";
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
    <form action={action} className="grid gap-2 lg:grid-cols-[140px_130px_130px_130px_minmax(180px,1fr)_88px]">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="featureKey" value={featureKey} />

      <label className="sr-only" htmlFor={`${featureKey}-override`}>
        單店覆寫
      </label>
      <select
        id={`${featureKey}-override`}
        name="override"
        defaultValue={override}
        className="h-9 rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
      >
        <option value="INHERIT">跟隨方案</option>
        <option value="ENABLED">強制開啟</option>
        <option value="DISABLED">強制關閉</option>
      </select>

      <label className="sr-only" htmlFor={`${featureKey}-source`}>
        來源
      </label>
      <select
        id={`${featureKey}-source`}
        name="source"
        defaultValue={source}
        className="h-9 rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
      >
        <option value="ADDON">ADDON</option>
        <option value="MANUAL">MANUAL</option>
        <option value="PROMO">PROMO</option>
        <option value="HQ_OVERRIDE">HQ_OVERRIDE</option>
      </select>

      <label className="sr-only" htmlFor={`${featureKey}-startsAt`}>
        開始日
      </label>
      <input
        id={`${featureKey}-startsAt`}
        name="startsAt"
        type="date"
        defaultValue={startsAt}
        className="h-9 rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
      />

      <label className="sr-only" htmlFor={`${featureKey}-expiresAt`}>
        到期日
      </label>
      <input
        id={`${featureKey}-expiresAt`}
        name="expiresAt"
        type="date"
        defaultValue={expiresAt}
        className="h-9 rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
      />

      <label className="sr-only" htmlFor={`${featureKey}-note`}>
        備註
      </label>
      <input
        id={`${featureKey}-note`}
        name="note"
        defaultValue={note}
        className="h-9 rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 focus:border-primary-500 focus:outline-none"
        placeholder="HQ 內部備註"
      />

      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-primary-600 px-3 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "儲存中" : "儲存"}
      </button>

      {(state.error || state.success) && (
        <p
          className={`lg:col-span-6 rounded-md px-2 py-1 text-xs ${
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
