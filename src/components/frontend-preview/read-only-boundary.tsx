"use client";
import { useState, type ReactNode } from "react";
import { isFrontendPreviewPath } from "@/lib/frontend-preview";

/** No form submission or exit to a live front-end, including LINE/calendar links. */
export function ReadOnlyPreviewBoundary({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return <div onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); setMessage("預覽中不會儲存"); }} onClickCapture={event => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !isFrontendPreviewPath(url.pathname)) {
      event.preventDefault(); event.stopPropagation(); setMessage("此操作需在正式前台進行，預覽中不會儲存或發送通知。");
    }
  }}>
    {message && <p role="status" className="sticky top-0 z-50 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}<button type="button" aria-label="關閉提示" className="ml-3 min-h-11 px-3" onClick={() => setMessage("")}>×</button></p>}
    {children}
  </div>;
}
