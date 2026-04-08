"use client";

import { useState, useCallback, useEffect, useActionState } from "react";
import { createBooking } from "@/server/actions/booking";
import { fetchDaySlots } from "@/server/actions/slots";
import { toLocalDateStr } from "@/lib/date-utils";
import { toast } from "sonner";
import type { SlotAvailability } from "@/types";

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
}

interface Props {
  customerId: string;
  activeWallets: ActiveWallet[];
}

// Next 14 days helper (Taiwan time)
function getNextDays(n: number): string[] {
  const days: string[] = [];
  const today = toLocalDateStr();
  const [y, m, d] = today.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

export function CreateBookingForm({ customerId, activeWallets }: Props) {
  const days = getNextDays(14);
  const [selectedDate, setSelectedDate] = useState(days[0]);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);

  const loadSlots = useCallback(async (date: string) => {
    setLoadingSlots(true);
    try {
      const result = await fetchDaySlots(date);
      setSlots(result.slots);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    loadSlots(selectedDate);
  }, [selectedDate, loadSlots]);

  // 可預約的時段（排除已過和已滿）
  const availableSlots = slots.filter((s) => s.available > 0 && !s.isPast);

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null; success: boolean }, formData: FormData) => {
      const bookingDate = formData.get("bookingDate") as string;
      const slotTime = formData.get("slotTime") as string;
      const bookingType = formData.get("bookingType") as "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION";
      const customerPlanWalletId = formData.get("customerPlanWalletId") as string | null;
      const people = Number(formData.get("people")) || 1;

      const result = await createBooking({
        customerId,
        bookingDate,
        slotTime,
        bookingType,
        customerPlanWalletId: customerPlanWalletId || undefined,
        people,
      });
      if (result.success) {
        toast.success("預約已建立");
        // 重新載入時段（反映新預約）
        loadSlots(bookingDate);
        return { error: null, success: true };
      }
      toast.error(result.error ?? "建立預約失敗");
      return { error: result.error ?? "發生錯誤", success: false };
    },
    { error: null, success: false }
  );

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
        <select
          name="bookingDate"
          required
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm"
        >
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-earth-500">時段</label>
        {loadingSlots ? (
          <p className="mt-1 py-1 text-xs text-earth-400">載入中...</p>
        ) : availableSlots.length === 0 ? (
          <p className="mt-1 py-1 text-xs text-amber-600">
            {slots.length === 0 ? "公休日" : "無可用時段"}
          </p>
        ) : (
          <select name="slotTime" required className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
            {availableSlots.map((s) => (
              <option key={s.startTime} value={s.startTime}>
                {s.startTime}（剩 {s.available} 位）
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-xs text-earth-500">類型</label>
        <select name="bookingType" required className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          <option value="PACKAGE_SESSION">課程堂數</option>
          <option value="FIRST_TRIAL">體驗</option>
          <option value="SINGLE">單次</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-earth-500">人數</label>
        <select name="people" defaultValue="1" className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm">
          <option value="1">1 人</option>
          <option value="2">2 人</option>
          <option value="3">3 人</option>
          <option value="4">4 人</option>
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
          disabled={pending || availableSlots.length === 0}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "建立中…" : "建立預約"}
        </button>
      </div>
    </form>
  );
}
