"use client";
import { useEffect, type ReactNode, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { operationStateKey, readOperationState } from "@/lib/operation-state";

const validPosition = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function ReturnPosition({ scope, children }: { scope: string; children?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const key = operationStateKey(scope, `position:${location.pathname}${location.search}`);
    let top: number | undefined;
    try { top = readOperationState(sessionStorage, key, validPosition); sessionStorage.removeItem(key); } catch { return; }
    if (top === undefined) return;
    router.refresh();
    let stopped = false;
    let frame = 0;
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!stopped) window.scrollTo({ top, behavior: "instant" }); });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restore);
    const stop = () => { stopped = true; cancelAnimationFrame(frame); observer?.disconnect(); };
    observer?.observe(document.body);
    restore();
    const timer = setTimeout(stop, 1200);
    const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    events.forEach(event => window.addEventListener(event, stop, { once: true, passive: true }));
    return () => { stop(); clearTimeout(timer); events.forEach(event => window.removeEventListener(event, stop)); };
  }, [scope, pathname, router]);
  function remember(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest("a");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.pathname === location.pathname) return;
    try { sessionStorage.setItem(operationStateKey(scope, `position:${location.pathname}${location.search}`), JSON.stringify({ at: Date.now(), value: window.scrollY })); } catch {}
  }
  return <div className="contents" onClickCapture={remember}>{children}</div>;
}
