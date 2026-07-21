"use client";

import { useActionState } from "react";
import {
  claimCentralMembershipsAction,
  type CentralMemberClaimState,
} from "@/server/actions/central-member-claim";

const initialState: CentralMemberClaimState = { error: null, success: false, claimedCount: 0 };

export function CentralMemberClaimForm() {
  const [state, action, pending] = useActionState(claimCentralMembershipsAction, initialState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="claimPhone" className="mb-2 block text-base font-medium text-earth-800">
          輸入目前會員手機號碼
        </label>
        <input
          id="claimPhone"
          name="claimPhone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="例如：0912345678"
          className="h-12 w-full rounded-xl border border-earth-300 px-4 text-base text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      {state.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      {state.success && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.claimedCount > 0
            ? `已安全認領 ${state.claimedCount} 間門市的會員資料。`
            : "目前沒有其他可認領的門市會員資料。"}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-earth-900 px-4 font-semibold text-white hover:bg-earth-800 disabled:opacity-60"
      >
        {pending ? "確認中…" : "確認手機並認領其他門市"}
      </button>
    </form>
  );
}
