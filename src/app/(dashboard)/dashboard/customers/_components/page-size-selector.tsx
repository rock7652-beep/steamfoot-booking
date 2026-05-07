"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { PAGE_SIZE_OPTIONS } from "../page-size";

interface Props {
  pageSize: number;
}

export function PageSizeSelector({ pageSize }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(e.target.value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("pageSize", String(next));
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-earth-500">
      每頁顯示
      <select
        value={pageSize}
        onChange={onChange}
        disabled={isPending}
        aria-label="每頁顯示筆數"
        className="rounded-md border border-earth-300 bg-white px-2 py-1 text-xs text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-60"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} 位
          </option>
        ))}
      </select>
    </label>
  );
}
