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
  /** 用於分享事件埋點 */
  storeId?: string;
}

export function BookingForm({ customerId, selectedDate, slots, activeWallets, storeId }: Props) {
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
      <div className="space-y-5">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="mb-2 text-4xl">✅</div>
          <h2 className="text-xl font-bold text-green-800">預約成功！</h2>
          <p className="mt-2 text-base text-green-700">
            {selectedDate} {state.bookedTime} 已完成預約
          </p>
          <p className="mt-1 text-sm text-green-700">我們會為你保留時段</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href={`/book/new?date=${selectedDate}`}
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-green-300 bg-white px-5 text-base font-medium text-green-700 hover:bg-green-50"
            >
              再次預約
            </a>
            <a
              href="/my-bookings"
              className="flex min-h-[48px] items-center justify-center rounded-xl bg-green-600 px-5 text-base font-semibold text-white hover:bg-green-700"
            >
              查看我的預約
            </a>
          </div>
        </div>

        {/* B8: 邀請朋友 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 text-center">
          <p className="text-base text-earth-800">
            如果你身邊有人也有一樣的狀況
          </p>
          <p className="text-base text-earth-800">可以邀請他一起來體驗</p>

          {showShare ? (
            <div className="mt-4">
              <ShareReferral
                referralUrl={referralUrl}
                variant="compact"
                storeId={storeId}
                referrerId={customerId}
                source="booking-success"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowShare(true)}
              className="mt-5 w-full min-h-[48px] rounded-xl bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700"
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
      <p className="mb-3 text-base font-medium text-earth-800">選擇時段</p>

      {state.error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-medium text-red-700">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-5">
        {/* Slot grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {slots.filter((s) => s.isEnabled).map((slot) => {
            const isFull = slot.available === 0;
            return (
              <label
                key={slot.startTime}
                className={`relative flex min-h-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition-colors ${
                  isFull
                    ? "cursor-not-allowed border-earth-200 bg-earth-50 opacity-60"
                    : "border-earth-200 bg-white hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
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
                <span className="text-lg font-bold">{slot.startTime}</span>
                <span className={`mt-1 text-sm font-medium ${isFull ? "text-red-600" : "text-earth-700 has-[:checked]:text-primary-100"}`}>
                  {isFull ? "已額滿" : `剩 ${slot.available} 位`}
                </span>
              </label>
            );
          })}
        </div>

        {availableSlots.length === 0 && (
          <p className="text-center text-base text-earth-700">今日所有時段已額滿</p>
        )}

        {/* Wallet selection (if multiple) */}
        {activeWallets.length > 1 && (
          <div>
            <label className="mb-2 block text-base font-medium text-earth-800">使用課程</label>
            <select
              name="customerPlanWalletId"
              className="w-full rounded-xl border border-earth-300 px-4 text-base h-12 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
            className="w-full rounded-xl bg-primary-600 min-h-[52px] px-4 text-base font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "預約中…" : "確認預約"}
          </button>
        )}
      </form>
    </div>
  );
}
