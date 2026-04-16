"use client";

import { useActionState, useState } from "react";
import { createBooking } from "@/server/actions/booking";
import { toast } from "sonner";
import { ShareReferral } from "@/components/share-referral";
import { useStoreSlugRequired } from "@/lib/store-context";
import type { SlotAvailability } from "@/types";

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
}

interface Props {
  customerId: string;
  selectedDate: string;
  slots: SlotAvailability[];
  activeWallets: ActiveWallet[];
}

export function BookingForm({ customerId, selectedDate, slots, activeWallets }: Props) {
  type FormState = { error: string | null; success: boolean; bookedTime: string };
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData): Promise<FormState> => {
      const slotTime = formData.get("slotTime") as string;
      const customerPlanWalletId = formData.get("customerPlanWalletId") as string;

      const result = await createBooking({
        customerId,
        bookingDate: selectedDate,
        slotTime,
        bookingType: "PACKAGE_SESSION",
        customerPlanWalletId: customerPlanWalletId || undefined,
      });

      if (result.success) {
        toast.success("預約成功！");
        return { error: null, success: true, bookedTime: slotTime };
      }
      toast.error(result.error ?? "預約失敗");
      return { error: result.error, success: false, bookedTime: "" };
    },
    { error: null, success: false, bookedTime: "" }
  );

  const availableSlots = slots.filter((s) => s.isEnabled && s.available > 0);
  const fullSlots = slots.filter((s) => s.isEnabled && s.available === 0);

  const storeSlug = useStoreSlugRequired();
  const [showShare, setShowShare] = useState(false);
  const referralUrl = `/s/${storeSlug}?ref=${customerId}`;

  if (state.success) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="mb-2 text-3xl">✅</div>
          <h2 className="text-base font-semibold text-green-800">預約成功！</h2>
          <p className="mt-1 text-sm text-green-600">
            {selectedDate} {state.bookedTime} 已完成預約
          </p>
          <p className="mt-1 text-xs text-green-500">我們會為你保留時段</p>
          <div className="mt-4 flex justify-center gap-3">
            <a
              href={`/book/new?date=${selectedDate}`}
              className="rounded-lg bg-white px-4 py-2 text-sm text-green-700 border border-green-300 hover:bg-green-50"
            >
              再次預約
            </a>
            <a
              href="/my-bookings"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              查看我的預約
            </a>
          </div>
        </div>

        {/* B8: 邀請朋友 */}
        <div className="rounded-xl border border-earth-200 bg-white p-5 text-center">
          <p className="text-sm text-earth-600">
            如果你身邊有人也有一樣的狀況
          </p>
          <p className="text-sm text-earth-600">可以邀請他一起來體驗</p>

          {showShare ? (
            <div className="mt-4">
              <ShareReferral referralUrl={referralUrl} variant="compact" />
            </div>
          ) : (
            <button
              onClick={() => setShowShare(true)}
              className="mt-4 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              邀請朋友
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-earth-500">選擇時段</p>

      {state.error && (
        <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-4">
        {/* Slot grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.filter((s) => s.isEnabled).map((slot) => {
            const isFull = slot.available === 0;
            return (
              <label
                key={slot.startTime}
                className={`relative flex cursor-pointer flex-col items-center rounded-xl border p-3 text-center transition-colors ${
                  isFull
                    ? "cursor-not-allowed border-earth-200 bg-earth-50 opacity-50"
                    : "border-earth-200 bg-white hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                }`}
              >
                <input
                  type="radio"
                  name="slotTime"
                  value={slot.startTime}
                  disabled={isFull}
                  className="sr-only"
                  required
                />
                <span className="text-base font-bold">{slot.startTime}</span>
                <span className={`mt-0.5 text-xs ${isFull ? "text-red-500" : "text-earth-400 has-[:checked]:text-primary-200"}`}>
                  {isFull ? "已額滿" : `剩 ${slot.available} 位`}
                </span>
              </label>
            );
          })}
        </div>

        {availableSlots.length === 0 && (
          <p className="text-center text-sm text-earth-400">今日所有時段已額滿</p>
        )}

        {/* Wallet selection (if multiple) */}
        {activeWallets.length > 1 && (
          <div>
            <label className="mb-1 block text-xs text-earth-500">使用課程</label>
            <select
              name="customerPlanWalletId"
              className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {activeWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.planName}（剩 {w.remainingSessions} 堂）
                </option>
              ))}
            </select>
          </div>
        )}
        {activeWallets.length === 1 && (
          <input
            type="hidden"
            name="customerPlanWalletId"
            value={activeWallets[0].id}
          />
        )}

        {availableSlots.length > 0 && (
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "預約中…" : "確認預約"}
          </button>
        )}
      </form>
    </div>
  );
}
