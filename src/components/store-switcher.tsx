"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { switchActiveStore } from "@/server/actions/store-switch";

interface StoreOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface StoreSwitcherProps {
  stores: StoreOption[];
  activeStoreId: string | null; // null = "__all__"
  collapsed?: boolean;
}

const ALL_STORES_VALUE = "__all__";

export default function StoreSwitcher({
  stores,
  activeStoreId,
  collapsed = false,
}: StoreSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentLabel =
    activeStoreId === null
      ? "全部分店"
      : stores.find((s) => s.id === activeStoreId)?.name ?? "未知分店";

  function handleSelect(value: string) {
    setOpen(false);
    startTransition(async () => {
      await switchActiveStore(value);
      router.refresh();
    });
  }

  // Collapsed: show icon only
  if (collapsed) {
    return (
      <div className="flex justify-center px-1 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-md p-1.5 text-earth-400 hover:bg-earth-100 hover:text-earth-600"
          aria-label="切換分店"
          title={currentLabel}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex w-full items-center justify-between rounded-lg border border-earth-200 bg-earth-50 px-2.5 py-1.5 text-left text-xs text-earth-700 hover:bg-earth-100 disabled:opacity-50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <svg className="h-3.5 w-3.5 shrink-0 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" />
          </svg>
          <span className="truncate">{currentLabel}</span>
        </span>
        {isPending ? (
          <svg className="h-3 w-3 animate-spin text-earth-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className={`h-3 w-3 text-earth-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 overflow-hidden rounded-lg border border-earth-200 bg-white shadow-lg">
          {/* All stores option */}
          <button
            type="button"
            onClick={() => handleSelect(ALL_STORES_VALUE)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-earth-50 ${
              activeStoreId === null ? "bg-primary-50 font-medium text-primary-700" : "text-earth-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-earth-300" />
            全部分店
          </button>
          <div className="border-t border-earth-100" />
          {stores.map((store) => (
            <button
              key={store.id}
              type="button"
              onClick={() => handleSelect(store.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-earth-50 ${
                activeStoreId === store.id ? "bg-primary-50 font-medium text-primary-700" : "text-earth-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeStoreId === store.id ? "bg-primary-500" : "bg-earth-300"
                }`}
              />
              {store.name}
              {store.isDefault && (
                <span className="ml-auto text-[10px] text-earth-400">主店</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
