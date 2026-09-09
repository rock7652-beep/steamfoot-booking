"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Progressive disclosure; existing hash links still open their target section. */
export function CustomerDetailSection({ enabled, title, id, children }: {
  enabled: boolean; title: string; id?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!enabled || !id) return;
    const reveal = () => {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: "start" });
      }
    };
    const onLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search && target.hash === `#${id}` && ref.current) {
        ref.current.open = true;
      }
    };
    reveal();
    document.addEventListener("click", onLink, true);
    window.addEventListener("hashchange", reveal);
    return () => {
      document.removeEventListener("click", onLink, true);
      window.removeEventListener("hashchange", reveal);
    };
  }, [enabled, id]);
  if (!enabled) return id ? <div id={id}>{children}</div> : <>{children}</>;
  return (
    <details ref={ref} id={id} className="scroll-mt-24 rounded-lg border border-earth-200 bg-white">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-base font-semibold text-earth-800 focus-visible:outline-2 focus-visible:outline-primary-600">{title}</summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}
