"use client";

import { useState } from "react";
import { reviewUpgradeRequest, confirmUpgradePayment } from "@/server/actions/upgrade-request";
import { toast } from "sonner";

interface Props {
  requestId: string;
  /** 店舖目前方案與申請時不同 */
  planChanged?: boolean;
  /** 申請的 billingStatus（若 PENDING 表示待付款確認） */
  billingStatus?: string;
}

export function ReviewActions({ requestId, planChanged, billingStatus }: Props) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [done, setDone] = useState(false);

  // 待付款確認狀態
  if (billingStatus === "PENDING") {
    return <PaymentConfirmAction requestId={requestId} />;
  }

  async function handleReview(action: "APPROVED" | "REJECTED") {
    if (action === "APPROVED" && planChanged) {
      const confirmed = window.confirm(
        "店舖目前方案與申請時不同，確定要核准此申請嗎？"
      );
      if (!confirmed) return;
    }

    setPending(true);
    const result = await reviewUpgradeRequest({
      requestId,
      action,
      reviewNote: note.trim() || undefined,
      requiresPayment: action === "APPROVED" ? requiresPayment : undefined,
    });
    setPending(false);

    if (result.success) {
      setDone(true);
      if (action === "APPROVED" && requiresPayment) {
        toast.success("已核准，等待付款確認");
      } else {
        toast.success(action === "APPROVED" ? "已核准" : "已拒絕");
      }
    } else {
      toast.error(result.error);
    }
  }

  if (done) {
    return <p className="text-xs text-green-600 font-medium">已處理</p>;
  }

  return (
    <div className="space-y-2 border-t border-earth-100 pt-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="審核備註（選填）"
        rows={2}
        className="w-full rounded-lg border border-earth-200 px-3 py-2 text-xs text-earth-700 placeholder:text-earth-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
      />
      <label className="flex items-center gap-2 text-xs text-earth-600">
        <input
          type="checkbox"
          checked={requiresPayment}
          onChange={(e) => setRequiresPayment(e.target.checked)}
          className="rounded border-earth-300 text-primary-600 focus:ring-primary-300"
        />
        需先付款（核准後不立即啟用，待付款確認後生效）
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => handleReview("APPROVED")}
          disabled={pending}
          className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "處理中..." : requiresPayment ? "核准（待付款）" : "核准"}
        </button>
        <button
          onClick={() => handleReview("REJECTED")}
          disabled={pending}
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        >
          拒絕
        </button>
      </div>
    </div>
  );
}

// ── 付款確認子元件 ──

function PaymentConfirmAction({ requestId }: { requestId: string }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    const confirmed = window.confirm("確認已收到付款？方案將正式啟用。");
    if (!confirmed) return;

    setPending(true);
    const result = await confirmUpgradePayment({ requestId });
    setPending(false);

    if (result.success) {
      setDone(true);
      toast.success("付款已確認，方案已啟用");
    } else {
      toast.error(result.error);
    }
  }

  if (done) {
    return <p className="text-xs text-green-600 font-medium">付款已確認</p>;
  }

  return (
    <div className="border-t border-earth-100 pt-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-2">
        <p className="text-xs font-medium text-amber-800">已核准，等待付款確認</p>
      </div>
      <button
        onClick={handleConfirm}
        disabled={pending}
        className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? "確認中..." : "確認付款"}
      </button>
    </div>
  );
}
