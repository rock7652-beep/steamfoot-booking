"use client";

import { useState } from "react";
import { selectCentralMemberStoreAction } from "@/server/actions/central-member-store";
import { useFormStatus } from "react-dom";

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
  align?: "center" | "start";
  disabled?: boolean;
  onBeforeSwitch?: () => boolean;
  returnToLiff?: boolean;
}

export function CentralMemberStoreSwitcher({
  currentStoreName,
  currentStoreSlug,
  stores,
  compact = false,
  align = "center",
  disabled = false,
  onBeforeSwitch,
  returnToLiff = false,
}: CentralMemberStoreSwitcherProps) {
  const [open, setOpen] = useState(false);

  if (stores.length < 2) {
    return <span className={compact ? "text-base font-bold text-earth-900" : "text-sm text-earth-600"}>{currentStoreName}</span>;
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-label={`目前門市：${currentStoreName}，切換門市`}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex w-full min-h-11 touch-manipulation select-none items-center rounded-xl font-semibold text-earth-900 hover:bg-earth-100 active:bg-earth-100 ${compact ? "max-w-[190px] gap-2 px-2" : "justify-between gap-3 px-2 text-sm"}`}
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
        <div role="menu" className={`absolute z-50 mt-2 max-h-[60dvh] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-earth-200 bg-white p-2 shadow-xl ${compact ? `${align === "start" ? "left-0" : "left-1/2 -translate-x-1/2"} w-72` : "left-0 w-full"}`}>
          <p className="px-3 pb-2 pt-1 text-xs font-medium text-earth-500">切換目前門市</p>
          {stores.map((store) => (
            <form key={store.storeId} action={selectCentralMemberStoreAction} onSubmit={event => {
              if (disabled || store.storeSlug === currentStoreSlug || onBeforeSwitch?.() === false) event.preventDefault();
            }}>
              <input type="hidden" name="storeSlug" value={store.storeSlug} />
              {returnToLiff && <input type="hidden" name="memberEntry" value="liff" />}
              <StoreOptionButton store={store} isCurrent={store.storeSlug === currentStoreSlug} disabled={disabled} />
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreOptionButton({ store, isCurrent, disabled }: { store: CustomerStoreOption; isCurrent: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" role="menuitem" disabled={disabled || isCurrent || pending} aria-busy={pending}
    className={`flex min-h-12 w-full touch-manipulation select-none items-center justify-between gap-2 rounded-xl px-3 text-left text-sm hover:bg-earth-50 active:bg-earth-100 ${isCurrent ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-800"}`}>
    <span className="min-w-0 break-words">{store.storeName}</span>
    {isCurrent ? <span className="shrink-0 text-xs text-primary-700">目前門市</span> : pending ? <span className="shrink-0 text-xs text-earth-500">切換中…</span> : null}
  </button>;
}
