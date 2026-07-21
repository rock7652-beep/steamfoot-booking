"use client";

import { useActionState } from "react";
import {
  requestCentralMemberLinkReviewAction,
  type CentralMemberLinkReviewState,
} from "@/server/actions/central-member-link-review";

const initialState: CentralMemberLinkReviewState = { error: null, success: false };

export function CentralMemberLinkReviewForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState(requestCentralMemberLinkReviewAction, initialState);
  if (state.success) {
    return <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">已提出申請，門市確認前連結仍會保留，不影響原有預約。</p>;
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="block text-sm font-medium text-earth-800" htmlFor={`review-type-${storeId}`}>需要店家協助</label>
      <select id={`review-type-${storeId}`} name="type" defaultValue="UNLINK_REQUEST" className="h-11 w-full rounded-xl border border-earth-300 bg-white px-3 text-sm text-earth-900">
        <option value="UNLINK_REQUEST">申請解除這間門市連結</option>
        <option value="NOT_MY_MEMBERSHIP">這不是我的會員資料</option>
      </select>
      {state.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded-xl border border-earth-300 bg-white px-4 text-sm font-semibold text-earth-800 hover:bg-earth-50 disabled:opacity-60">
        {pending ? "送出中…" : "送出人工確認申請"}
      </button>
    </form>
  );
}
