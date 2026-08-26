"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { selectLiffMemberStoreAction } from "@/server/actions/liff-member-stores";
import type { LiffMemberStoreOption } from "@/server/actions/liff-member-stores";

export function LiffStoreSwitcher({
  currentStoreSlug,
  currentStoreName,
  stores,
}: {
  currentStoreSlug: string;
  currentStoreName: string;
  stores: LiffMemberStoreOption[];
}) {
  const [open, setOpen] = useState(false);

  if (stores.length < 2) {
    return (
      <p className="text-sm font-semibold tracking-[0.12em] text-primary-700">
        {currentStoreName}
      </p>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`目前門市：${currentStoreName}，切換門市`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-11 max-w-[240px] items-center gap-2 rounded-xl py-1 text-left text-primary-700"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium tracking-normal text-earth-500">
            目前門市
          </span>
          <span className="block truncate text-sm font-semibold tracking-[0.08em]">
            {currentStoreName}
          </span>
        </span>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-earth-200 bg-white p-2 shadow-xl"
        >
          <p className="px-3 pb-2 pt-1 text-xs font-medium text-earth-500">
            切換會員門市
          </p>
          {stores.map((store) => (
            <form key={store.storeSlug} action={selectLiffMemberStoreAction}>
              <input type="hidden" name="storeSlug" value={store.storeSlug} />
              <StoreOptionButton
                store={store}
                isCurrent={store.storeSlug === currentStoreSlug}
              />
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreOptionButton({
  store,
  isCurrent,
}: {
  store: LiffMemberStoreOption;
  isCurrent: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      role="menuitem"
      disabled={isCurrent || pending}
      aria-busy={pending}
      className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm disabled:cursor-default ${
        isCurrent
          ? "bg-primary-50 font-semibold text-primary-800"
          : "text-earth-800 hover:bg-earth-50 active:bg-earth-100 disabled:opacity-60"
      }`}
    >
      <span>{store.storeName}</span>
      {isCurrent ? (
        <span className="text-xs text-primary-700">目前門市</span>
      ) : pending ? (
        <span className="text-xs text-earth-500">切換中…</span>
      ) : null}
    </button>
  );
}
