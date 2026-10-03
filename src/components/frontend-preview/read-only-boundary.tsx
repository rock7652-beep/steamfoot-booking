"use client";
import { useState, type ReactNode } from "react";
import { isFrontendPreviewPath } from "@/lib/frontend-preview";

/** No form submission or exit to a live front-end, including LINE/calendar links. */
export function ReadOnlyPreviewBoundary({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return <div className="[&_.course-portal]:min-h-[calc(100dvh-45px)]" onKeyDown={event => { if (event.key === "Escape") setMessage(""); }} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); setMessage("預覽中不會儲存"); }} onClickCapture={event => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !isFrontendPreviewPath(url.pathname)) {
      event.preventDefault(); event.stopPropagation(); setMessage("請至正式前台操作，預覽不會儲存或通知。");
    }
  }}>
    {message && <div className="pointer-events-none fixed inset-x-0 top-[45px] z-50 px-3 pt-2"><p role="status" className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 pl-3 text-sm text-amber-900 shadow-md"><span className="min-w-0 flex-1">{message}</span><button type="button" aria-label="關閉提示" className="min-h-11 min-w-11 shrink-0" onClick={() => setMessage("")}>×</button></p></div>}
    {children}
  </div>;
}
