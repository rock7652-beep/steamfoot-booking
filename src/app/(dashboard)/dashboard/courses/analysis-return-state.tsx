"use client";

import { useLayoutEffect, useRef, type ReactNode, type MouseEvent } from "react";

/** Preserve only presentation state when opening a customer from this report. */
export function AnalysisReturnState({ scope, children }: { scope: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const key = `course-analysis-return:v1:${scope}`;

  useLayoutEffect(() => {
    let frame = 0;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.url !== location.pathname + location.search || !Array.isArray(saved.details)) return;
      const details = root.current?.querySelectorAll("details");
      details?.forEach((element, index) => {
        const state = saved.details[index];
        if (state && typeof state.open === "boolean") {
          element.open = state.open;
          const list = element.querySelector("ul");
          if (list && Number.isFinite(state.scrollTop)) list.scrollTop = Math.max(0, state.scrollTop);
        }
      });
      if (Number.isFinite(saved.scrollY)) {
        // Next restores route scroll too; run after the reopened list has layout.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            window.scrollTo({ top: Math.max(0, saved.scrollY), behavior: "instant" });
            sessionStorage.removeItem(key);
          });
        });
      }
    } catch { /* Restricted browser storage must not prevent navigation. */ }
    return () => cancelAnimationFrame(frame);
  }, [key]);

  function remember(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest("a");
    if (!link || link.target === "_blank") return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.searchParams.get("view") !== "customers") return;
    try {
      sessionStorage.setItem(key, JSON.stringify({
        url: location.pathname + location.search,
        scrollY: window.scrollY,
        details: Array.from(root.current?.querySelectorAll("details") ?? []).map(element => ({
          open: element.open, scrollTop: element.querySelector("ul")?.scrollTop ?? 0,
        })),
      }));
    } catch { /* The ordinary customer link remains usable without storage. */ }
  }

  return <div ref={root} className="contents" onClickCapture={remember}>{children}</div>;
}
