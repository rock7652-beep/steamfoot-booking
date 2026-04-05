"use client";

import { useActionState } from "react";
import { createBooking } from "@/server/actions/booking";

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
}

interface Props {
  customerId: string;
  activeWallets: ActiveWallet[];
}

// Next 14 days helper
function getNextDays(n: number): string[] {
  const days: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const date = new Date(d);
    date.setDate(d.getDate() + i);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

const SLOT_TIMES = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];

export function CreateBookingForm({ customerId, activeWallets }: Props) {
  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null; success: boolean }, formData: FormData) => {
      const bookingDate = formData.get("bookingDate") as string;
      const slotTime = formData.get("slotTime") as string;
      const bookingType = formData.get("bookingType") as "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION";
      const customerPlanWalletId = formData.get("customerPlanWalletId") as string | null;

      const result = await createBooking({
        customerId,
        bookingDate,
        slotTime,
        bookingType,
        customerPlanWalletId: customerPlanWalletId || undefined,
      });
      if (result.success) return { error: null, success: true };
      return { error: result.error ?? "發生錯誤", success: false };
    },
    { error: null, success: false }
  );

  const days = getNextDays(14);

  return (
    <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {state.success && (
        <div className="col-span-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          預約建立成功！
        </div>
      )}
      {state.error && (
        <div className="col-span-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-xs text-earth-500">日期</label>
        <select name="bookingDate" required className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-earth-500">時段</label>
        <select name="slotTime" required className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          {SLOT_TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-earth-500">類型</label>
        <select name="bookingType" required className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          <option value="PACKAGE_SESSION">套餐堂數</option>
          <option value="FIRST_TRIAL">體驗</option>
          <option value="SINGLE">單次</option>
        </select>
      </div>

      {activeWallets.length > 0 && (
        <div>
          <label className="block text-xs text-earth-500">使用課程</label>
          <select name="customerPlanWalletId" className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
            <option value="">不指定</option>
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.planName}（剩 {w.remainingSessions} 堂）
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="col-span-2 flex items-end sm:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "建立中…" : "建立預約"}
        </button>
      </div>
    </form>
  );
}
