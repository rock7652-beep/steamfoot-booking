"use client";

import { useState, useActionState } from "react";
import { assignPlanToCustomer } from "@/server/actions/wallet";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

interface Props {
  customerId: string;
  plans: Plan[];
}

export function AssignPlanForm({ customerId, plans }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const planId = formData.get("planId") as string;
      const paymentMethod = formData.get("paymentMethod") as string;
      const result = await assignPlanToCustomer({
        customerId,
        planId,
        paymentMethod: paymentMethod as "CASH" | "TRANSFER" | "LINE_PAY" | "CREDIT_CARD" | "OTHER" | "UNPAID",
      });
      if (result.success) {
        toast.success("方案已成功指派");
        setOpen(false);
        return { error: null };
      }
      toast.error(result.error ?? "指派失敗");
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null }
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
      >
        + 指派方案
      </button>
    );
  }

  return (
    <form action={action} className="rounded-lg border border-primary-200 bg-primary-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-primary-800">指派課程方案</h3>
      {state.error && (
        <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">{state.error}</p>
      )}
      <div className="mb-2">
        <label className="block text-xs text-earth-600">課程方案</label>
        <select name="planId" required className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          <option value="">選擇方案...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（NT$ {p.price.toLocaleString()}，{p.sessionCount} 堂）
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3">
        <label className="block text-xs text-earth-600">付款方式</label>
        <select name="paymentMethod" className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          <option value="CASH">現金</option>
          <option value="TRANSFER">匯款</option>
          <option value="LINE_PAY">LINE Pay</option>
          <option value="CREDIT_CARD">信用卡</option>
          <option value="OTHER">其他</option>
          <option value="UNPAID">未付款</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "處理中…" : "確認購買"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-earth-100 px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-200"
        >
          取消
        </button>
      </div>
    </form>
  );
}
