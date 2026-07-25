"use client";

import { useActionState } from "react";
import {
  setDigitalButlerActivationAction,
  type StoreFeatureEntitlementFormState,
} from "@/server/actions/store-feature-entitlement";

const initialState: StoreFeatureEntitlementFormState = { success: null, error: null };

export function DigitalButlerActivationForm({
  storeId,
  enabled,
}: {
  storeId: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    setDigitalButlerActivationAction,
    initialState,
  );

  return (
    <form action={action} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-950">數位管家執行開關</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            功能授權控制後台入口；此開關控制 LINE 是否實際啟動對話。緊急關閉不會刪除流程或名單。
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`h-10 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50 ${
            enabled ? "bg-red-600 hover:bg-red-700" : "bg-primary-600 hover:bg-primary-700"
          }`}
        >
          {pending ? "處理中" : enabled ? "緊急關閉" : "啟用 LINE 對話"}
        </button>
      </div>
      <p className="mt-2 text-xs font-medium text-amber-900">
        目前狀態：{enabled ? "已啟用" : "未啟用"}
      </p>
      {(state.error || state.success) && (
        <p className={`mt-2 rounded px-2 py-1 text-xs ${state.error ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}
