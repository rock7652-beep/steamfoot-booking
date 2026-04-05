"use client";

import { useState, useActionState } from "react";
import { transferCustomer } from "@/server/actions/customer";

interface Props {
  customerId: string;
  currentStaffId: string | null;
  staffList: { id: string; displayName: string }[];
}

export function TransferCustomerForm({ customerId, currentStaffId, staffList }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const newStaffId = formData.get("newStaffId") as string;
      const result = await transferCustomer({ customerId, newStaffId });
      if (result.success) {
        setOpen(false);
        return { error: null };
      }
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null }
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-orange-600 hover:underline"
      >
        轉讓直屬店長
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select
        name="newStaffId"
        defaultValue={currentStaffId ?? undefined}
        className="rounded border border-earth-300 px-2 py-1 text-sm"
      >
        {staffList.map((s) => (
          <option key={s.id} value={s.id}>{s.displayName}</option>
        ))}
      </select>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700 hover:bg-orange-200 disabled:opacity-60"
      >
        {pending ? "轉讓中…" : "確認轉讓"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-earth-400 hover:text-earth-600">
        取消
      </button>
    </form>
  );
}
