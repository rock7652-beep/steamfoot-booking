"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CustomerInstantSearch } from "@/components/customer-instant-search";

export function HealthCustomerSearch({ storeId, search = "", customerId = "" }: {
  storeId: string;
  search?: string;
  customerId?: string;
}) {
  const [value, setValue] = useState(search);
  const [selectedId, setSelectedId] = useState(customerId);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  return <div ref={containerRef} className="min-w-0" aria-busy={pending}>
    <label htmlFor="health-customer-search" className="mb-1 block text-xs font-medium text-earth-600">搜尋顧客</label>
    <input type="hidden" name="customerId" value={selectedId} />
    <CustomerInstantSearch storeId={storeId} id="health-customer-search" value={value}
      className="min-h-10 w-full min-w-0 max-w-full rounded-md border border-earth-200 px-3 text-sm focus:border-primary-500 focus:outline-none"
      onChange={(text) => { setValue(text); setSelectedId(""); }}
      onSelect={(customer) => {
        const form = containerRef.current?.closest("form");
        if (!form) return;
        const params = new URLSearchParams();
        const fields = new FormData(form);
        for (const key of ["from", "to", "metric"]) {
          const field = fields.get(key);
          if (typeof field === "string" && field) params.set(key, field);
        }
        params.set("search", customer.name);
        params.set("customerId", customer.id);
        setValue(customer.name);
        setSelectedId(customer.id);
        startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
      }} />
    <p role="status" className="mt-1 text-xs text-earth-500">
      {pending ? "正在更新量測紀錄…" : "輸入即顯示相關顧客，點選後查看量測紀錄；也可直接套用關鍵字篩選。"}
    </p>
  </div>;
}
