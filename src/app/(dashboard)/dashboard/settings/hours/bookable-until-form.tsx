"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBookableUntilDate } from "@/server/actions/shop";

interface Props {
  /** 目前 ShopConfig.bookableUntilDate（"YYYY-MM-DD"）；null = 未設定 */
  initialDate: string | null;
  /** 未設定時的預設可預約到日期（"YYYY-MM-DD"，今天 +14 天） */
  defaultUntil: string;
  /** 今天（"YYYY-MM-DD"，台灣時間），作為 date input 下限 */
  today: string;
  canManage: boolean;
}

export function BookableUntilForm({ initialDate, defaultUntil, today, canManage }: Props) {
  const [date, setDate] = useState(initialDate ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(next: string | null) {
    startTransition(async () => {
      const result = await updateBookableUntilDate({ date: next });
      if (result.success) {
        toast.success(
          next
            ? `已開放顧客預約至 ${next}`
            : "已清空，回到預設（今天起 14 天內）",
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    });
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white px-5 py-4 shadow-sm">
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-earth-900">顧客可預約到日期</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-earth-500">
          控制顧客自助預約最遠可預約到哪一天（含當日）。後台代客預約不受此限制。
          未設定時預設開放今天起 14 天內。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          min={today}
          disabled={!canManage || pending}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-60"
        />
        {canManage && (
          <>
            <button
              type="button"
              disabled={pending || !date}
              onClick={() => save(date || null)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "儲存中..." : "儲存"}
            </button>
            <button
              type="button"
              disabled={pending || (!initialDate && !date)}
              onClick={() => {
                setDate("");
                save(null);
              }}
              className="rounded-lg border border-earth-200 px-3 py-2 text-sm font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-60"
            >
              清空（回預設）
            </button>
          </>
        )}
      </div>

      <p className="mt-2 text-[11px] text-earth-500">
        目前生效：
        <span className="font-semibold text-earth-800">
          {initialDate ? `開放至 ${initialDate}` : `預設（至 ${defaultUntil}）`}
        </span>
      </p>
    </section>
  );
}
