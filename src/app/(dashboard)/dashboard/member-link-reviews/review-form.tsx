"use client";

import { useActionState } from "react";
import {
  reviewCentralMemberLinkAction,
  type ReviewCentralMemberLinkState,
} from "@/server/actions/central-member-link-review-admin";

const initialState: ReviewCentralMemberLinkState = { error: null, success: false };

export function MemberLinkReviewForm({
  requestId,
  type,
  canApprove,
}: {
  requestId: string;
  type: "NOT_MY_MEMBERSHIP" | "UNLINK_REQUEST";
  canApprove: boolean;
}) {
  const [state, action, pending] = useActionState(reviewCentralMemberLinkAction, initialState);

  if (state.success) return <p className="text-sm font-medium text-green-700">已完成處理</p>;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <label className="block text-xs font-medium text-earth-700">
        處理原因（必填）
        <textarea
          name="reviewNote"
          required
          rows={2}
          className="mt-1 w-full rounded-md border border-earth-200 px-3 py-2 text-sm"
          placeholder={type === "NOT_MY_MEMBERSHIP" ? "請記錄確認結果" : "請記錄核准或拒絕原因"}
        />
      </label>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="APPROVED"
          disabled={pending || !canApprove}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          title={!canApprove ? "有效方案或未來預約尚未處理" : undefined}
        >
          {type === "NOT_MY_MEMBERSHIP" ? "標記已受理" : "核准解除"}
        </button>
        <button
          type="submit"
          name="decision"
          value="REJECTED"
          disabled={pending}
          className="rounded-md border border-earth-300 px-3 py-1.5 text-xs font-medium text-earth-700 disabled:opacity-40"
        >
          拒絕申請
        </button>
      </div>
    </form>
  );
}
