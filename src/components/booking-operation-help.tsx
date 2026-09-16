"use client";

import { useId, useRef, useState } from "react";
import { OperationGuideContent } from "@/components/operation-guide-content";
import type { GuideContext } from "@/lib/operation-guide";
import { DashboardLink } from "@/components/dashboard-link";

/** Native dialog preserves the page tree, traps focus and restores trigger focus. */
export function BookingOperationHelp({ context = "booking-list", bookingStatus }: { context?: GuideContext; bookingStatus?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [session, setSession] = useState(0);

  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => {
      setSession((value) => value + 1); dialog.current?.showModal();
    }} className="min-h-11 rounded-lg border border-gold-300 bg-white px-3 text-sm font-semibold text-primary-800 hover:bg-earth-50">
      ？操作說明
    </button>
    <dialog ref={dialog} aria-labelledby={heading}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-gold-200 bg-earth-50 p-0 text-earth-900 shadow-xl backdrop:bg-black/30 md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[440px] md:rounded-none"
      onClick={(event) => { if (event.target === dialog.current) {
        const rect = dialog.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current.close();
      } }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gold-300 bg-earth-50 px-5 py-3">
        <h2 id={heading} className="text-lg font-semibold text-primary-900">操作說明</h2>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary-800">關閉</button>
      </div>
      <div className="space-y-5 p-5 pb-8">
        <OperationGuideContent key={session} context={context} bookingStatus={bookingStatus} />
        <DashboardLink href="/dashboard/guide" target="_blank" rel="noreferrer" className="block border-t border-gold-200 pt-4 text-sm font-semibold text-primary-800 underline underline-offset-4">開啟完整操作指南（另開分頁）</DashboardLink>
      </div>
    </dialog>
  </>;
}
