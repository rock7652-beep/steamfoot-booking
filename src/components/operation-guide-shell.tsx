"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { OperationGuideContent } from "./operation-guide-content";
import { GuideAccessContext } from "./operation-guide-access";
import type { GuideAccess } from "@/lib/operation-guide-types";
import { lockGuideBackground } from "@/lib/operation-guide-scroll";
import { DashboardLink } from "./dashboard-link";

const GuideContext = createContext<{ open: () => void; register: (status?: string) => void } | null>(null);

export function OperationGuideTrigger() {
  const guide = useContext(GuideContext);
  if (!guide) return null;
  return <button type="button" onClick={guide.open} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border border-gold-300 bg-white px-3 text-sm font-semibold text-primary-800">？操作指南</button>;
}

/** Register context only; the header remains the sole help entry. */
export function BookingGuideContext({ status }: { status?: string }) {
  const guide = useContext(GuideContext);
  const register = guide?.register;
  useEffect(() => {
    register?.(status ?? "UNKNOWN");
    return () => register?.(undefined);
  }, [register, status]);
  return null;
}

export function OperationGuideShell({ enabled, children, access = { module: "steamfoot", permissions: [], features: {} } }: { enabled: boolean; children?: ReactNode; access?: GuideAccess }) {
  const pathname = usePathname();
  const panel = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<string>();
  const register = useCallback((next?: string) => setStatus(next), []);
  const open = useCallback(() => {
    if (panel.current?.open) return;
    if (window.matchMedia("(min-width: 1024px)").matches) panel.current?.show();
    else panel.current?.showModal();
    setOpened(true);
  }, []);
  const close = useCallback(() => { panel.current?.close(); setOpened(false); }, []);
  useEffect(() => {
    if (!enabled || !opened) return;
    const media = window.matchMedia("(min-width: 1024px)");
    let unlock = media.matches || !panel.current ? undefined : lockGuideBackground(panel.current);
    const resize = () => {
      unlock?.();
      unlock = undefined;
      panel.current?.close();
      if (media.matches) panel.current?.show();
      else {
        panel.current?.showModal();
        if (panel.current) unlock = lockGuideBackground(panel.current);
      }
    };
    media.addEventListener("change", resize);
    return () => { media.removeEventListener("change", resize); unlock?.(); };
  }, [enabled, opened]);
  if (!enabled) return <>{children}</>;
  const bookingPage = pathname.endsWith("/bookings");
  return <GuideAccessContext.Provider value={access}><GuideContext.Provider value={{ open, register }}>
    <div data-operation-guide-shell data-guide-open={opened ? "true" : "false"}>
      {children}
      <dialog ref={panel} aria-labelledby={heading} onCancel={close} onClose={() => { if (!panel.current?.open) setOpened(false); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
        className="fixed inset-x-0 bottom-0 top-auto z-[80] m-0 h-[85dvh] max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-2xl border border-gold-200 bg-earth-50 p-0 text-earth-900 shadow-xl backdrop:bg-black/30 lg:bottom-0 lg:left-auto lg:right-0 lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:max-h-none lg:w-[360px] min-[1440px]:w-[380px] lg:rounded-none">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gold-200 px-5">
          <h2 id={heading} className="font-semibold text-primary-900">操作指南</h2>
          <button autoFocus type="button" onClick={close} className="min-h-11 px-3 text-primary-800">關閉</button>
        </div>
        <div data-guide-scroll className="h-[calc(100%-4rem)] min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] touch-pan-y" style={{ WebkitOverflowScrolling: "touch" }}>
          <OperationGuideContent pathname={pathname} context={bookingPage ? (status ? "booking-detail" : "booking-list") : "general"} bookingStatus={status} />
          <DashboardLink href="/dashboard/guide" target="_blank" rel="noreferrer" className="block border-t border-gold-200 pt-4 text-sm font-semibold text-primary-800 underline underline-offset-4">查看全部教學（另開分頁）</DashboardLink>
        </div>
      </dialog>
    </div>
    <style>{`
      [data-operation-guide-shell] [data-dashboard-header] { z-index: 60; }
      [data-operation-guide-shell] [data-right-sheet] { top: 3.5rem; }
      @media (min-width: 1440px) {
        [data-operation-guide-shell][data-guide-open="true"] { padding-right: 380px; }
        [data-operation-guide-shell][data-guide-open="true"] [data-right-sheet] { right: 380px; }
      }
    `}</style>
  </GuideContext.Provider></GuideAccessContext.Provider>;
}
