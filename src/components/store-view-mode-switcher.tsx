"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { switchViewedStore } from "@/server/actions/store-view-mode";
import { OWN_STORE_VALUE } from "@/lib/store-view-mode-constants";

interface ViewStoreOption {
  id: string;
  name: string;
}

interface StoreViewModeSwitcherProps {
  ownStore: ViewStoreOption;
  descendantStores: ViewStoreOption[];
  viewedStoreId: string;
  collapsed?: boolean;
}

export function StoreViewModeSwitcher({
  ownStore,
  descendantStores,
  viewedStoreId,
  collapsed = false,
}: StoreViewModeSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isOwnStore = viewedStoreId === ownStore.id;
  const viewedStore = isOwnStore
    ? ownStore
    : (descendantStores.find((store) => store.id === viewedStoreId) ?? ownStore);
  const currentLabel = isOwnStore ? "我的店" : viewedStore.name;

  function handleSelect(nextStoreId: string) {
    setOpen(false);
    startTransition(async () => {
      const result = await switchViewedStore(nextStoreId);
      if (result.success) router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div ref={ref} className="relative flex justify-center px-1 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={isPending}
          className="rounded-md p-1.5 text-earth-400 hover:bg-earth-100 hover:text-earth-600 disabled:opacity-50"
          aria-label="切換查看店舖"
          title={currentLabel}
        >
          <EyeIcon />
        </button>
        {open ? (
          <SwitcherMenu
            ownStore={ownStore}
            descendantStores={descendantStores}
            viewedStoreId={viewedStoreId}
            onSelect={handleSelect}
            compact
          />
        ) : null}
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
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-earth-400"><EyeIcon /></span>
          <span className="truncate">{currentLabel}</span>
        </span>
        <ChevronIcon open={open} />
      </button>
      {open ? (
        <SwitcherMenu
          ownStore={ownStore}
          descendantStores={descendantStores}
          viewedStoreId={viewedStoreId}
          onSelect={handleSelect}
        />
      ) : null}
    </div>
  );
}

function SwitcherMenu({
  ownStore,
  descendantStores,
  viewedStoreId,
  onSelect,
  compact = false,
}: {
  ownStore: ViewStoreOption;
  descendantStores: ViewStoreOption[];
  viewedStoreId: string;
  onSelect: (storeId: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "absolute left-12 top-1 z-30 w-56 overflow-hidden rounded-lg border border-earth-200 bg-white shadow-lg"
          : "absolute left-3 right-3 top-full z-30 mt-1 overflow-hidden rounded-lg border border-earth-200 bg-white shadow-lg"
      }
    >
      <button
        type="button"
        onClick={() => onSelect(OWN_STORE_VALUE)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-earth-50 ${
          viewedStoreId === ownStore.id ? "bg-primary-50 font-medium text-primary-700" : "text-earth-600"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
        <span className="min-w-0 flex-1">
          <span className="block">我的店</span>
          <span className="block truncate text-[10px] font-normal text-earth-400">
            {ownStore.name}
          </span>
        </span>
      </button>
      <div className="border-t border-earth-100 px-3 py-1.5 text-[10px] font-semibold text-earth-400">
        查看下層店
      </div>
      {descendantStores.length > 0 ? (
        descendantStores.map((store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => onSelect(store.id)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-earth-50 ${
              viewedStoreId === store.id ? "bg-primary-50 font-medium text-primary-700" : "text-earth-600"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                viewedStoreId === store.id ? "bg-primary-500" : "bg-earth-300"
              }`}
            />
            <span className="truncate">{store.name}</span>
          </button>
        ))
      ) : (
        <div className="px-3 py-2 text-xs leading-5 text-earth-400">
          目前沒有可查看的下層店
        </div>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 text-earth-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
