"use client";

import { useRouter } from "next/navigation";

export function StaffScheduleDatePicker({
  storeSlug,
  selectedDate,
}: {
  storeSlug: string;
  selectedDate: string;
}) {
  const router = useRouter();

  return (
    <input
      key={selectedDate}
      aria-label="選擇日期"
      type="date"
      defaultValue={selectedDate}
      className="rounded-lg border border-earth-300 px-3 py-2 text-sm"
      onChange={(event) => {
        if (!event.currentTarget.value) return;
        router.push(`/s/${encodeURIComponent(storeSlug)}/staff/my-bookings?date=${event.currentTarget.value}`);
      }}
    />
  );
}