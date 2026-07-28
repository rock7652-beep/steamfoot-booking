"use client";

import { useState } from "react";
import { selectCentralMemberStoreAction } from "@/server/actions/central-member-store";

export interface CustomerStoreOption {
  storeId: string;
  storeName: string;
  storeSlug: string;
}

interface CentralMemberStoreSwitcherProps {
  currentStoreName: string;
  currentStoreSlug: string;
  stores: CustomerStoreOption[];
  compact?: boolean;
}

export function CentralMemberStoreSwitcher({
  currentStoreName,
  currentStoreSlug,
  stores,
  compact = false,
}: CentralMemberStoreSwitcherProps) {
  const [open, setOpen] = useState(false);

  if (stores.length < 2) {
    return <span className={compact ? "text-base font-bold text-earth-900" : "text-sm text-earth-600"}>{currentStoreName}</span>;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`目前門市：${currentStoreName}，切換門市`}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex min-h-11 touch-manipulation select-none items-center rounded-xl font-semibold text-earth-900 hover:bg-earth-100 active:bg-earth-100 ${compact ? "max-w-[190px] gap-2 px-2" : "w-full justify-between gap-3 px-2 text-sm"}`}
      >
        <span className={`min-w-0 ${compact ? "flex flex-col items-start leading-tight" : "truncate"}`}>
          {compact && <span className="text-[10px] font-medium text-earth-500">目前門市</span>}
          <span className="block truncate">{currentStoreName}</span>
        </span>
        <span className="shrink-0 rounded-full bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
          切換門市
        </span>
        {!compact && (
          <svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        )}
      </button>
      {open && (
        <div role="menu" className={`absolute z-50 mt-2 overflow-hidden rounded-2xl border border-earth-200 bg-white p-2 shadow-xl ${compact ? "left-1/2 w-72 -translate-x-1/2" : "left-0 w-full"}`}>
          <p className="px-3 pb-2 pt-1 text-xs font-medium text-earth-500">切換目前門市</p>
          {stores.map((store) => (
            <form key={store.storeId} action={selectCentralMemberStoreAction}>
              <input type="hidden" name="storeSlug" value={store.storeSlug} />
              <button
                type="submit"
                role="menuitem"
                className={`flex min-h-12 w-full touch-manipulation select-none items-center justify-between rounded-xl px-3 text-left text-sm hover:bg-earth-50 active:bg-earth-100 ${store.storeSlug === currentStoreSlug ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-800"}`}
              >
                <span>{store.storeName}</span>
                {store.storeSlug === currentStoreSlug && <span className="text-xs text-primary-700">目前門市</span>}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
