"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsPanelContext, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { ADMIN_SETTINGS_PANEL } from "@/lib/admin-ui";

export function SettingsPanel({
  title,
  sourceHref,
  width = ADMIN_SETTINGS_PANEL.width,
  children,
}: {
  title: string;
  sourceHref: string;
  width?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const searchString = search.toString();
  const [states, setStates] = useState<Record<string, SettingsPanelState>>({});
  const [destination, setDestination] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  const dirty = Object.values(states).some(state => state.dirty);
  const pending = Object.values(states).some(state => state.pending);

  const report = useCallback((id: string, state: SettingsPanelState | null) => {
    setStates(previous => {
      if (state && previous[id]?.dirty === state.dirty && previous[id]?.pending === state.pending) return previous;
      const next = { ...previous };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  }, []);

  const closeHref = useMemo(() => {
    const params = new URLSearchParams(searchString);
    params.delete("panel");
    params.delete("panelQuery");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchString]);

  const go = useCallback((href: string) => {
    setDestination(null);
    startNavigation(() => router.replace(href, { scroll: false }));
  }, [router]);

  const request = useCallback((href: string) => {
    if (dirty || pending) setDestination(href);
    else go(href);
  }, [dirty, pending, go]);

  const navigate = useCallback((href: string) => {
    const url = new URL(href.startsWith("?") ? sourceHref + href : href, window.location.origin);
    const localPath = url.pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)|^\/hq(?=\/dashboard)/, "");

    if (url.origin === window.location.origin && localPath === sourceHref) {
      const params = new URLSearchParams(searchString);
      params.set("panel", "reminders");
      params.set("panelQuery", url.searchParams.toString());
      request(`${pathname}?${params}`);
      return;
    }

    if (url.origin === window.location.origin && localPath === "/dashboard/settings") {
      request(closeHref);
      return;
    }

    request(url.href);
  }, [closeHref, pathname, request, searchString, sourceHref]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (root.current?.querySelector('[data-right-sheet][aria-hidden="false"] [data-right-sheet][aria-hidden="false"], [role="alertdialog"]')) return;
      event.preventDefault();
      if (destination) setDestination(null);
      else request(closeHref);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("keydown", escape);
    };
  }, [dirty, pending, request, closeHref, destination]);

  const context = useMemo(() => ({ report, navigate }), [report, navigate]);

  return (
    <div ref={root} data-settings-panel>
      <RightSheet
        presentation="centered"
        open
        compact
        fixedHeight
        width={width}
        maxHeight={ADMIN_SETTINGS_PANEL.maxHeight}
        closeOnEscape={false}
        onClose={() => request(closeHref)}
        labelledById="settings-panel-title"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-xs text-earth-500">設定</p>
            <h2 id="settings-panel-title" className="font-semibold text-primary-900">{title}</h2>
          </div>
          <button type="button" onClick={() => request(closeHref)} className="min-h-11 shrink-0 rounded-lg border px-4 text-sm">
            關閉視窗
          </button>
        </header>

        {destination ? (
          <div role="alert" className="shrink-0 border-b border-amber-200 bg-amber-50 p-4">
            <p className="font-medium">{pending ? "設定仍在儲存，請稍候。" : "尚有未儲存的修改，要捨棄嗎？"}</p>
            <div className="mt-2 flex gap-3">
              <button autoFocus className="min-h-11 rounded border px-3 text-sm" onClick={() => setDestination(null)}>繼續編輯</button>
              {!pending ? (
                <button className="min-h-11 rounded bg-primary-700 px-3 text-sm text-white" onClick={() => go(destination)}>
                  {destination === closeHref ? "不儲存並關閉" : "不儲存並切換"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [&_[data-page-shell]]:px-4 [&_[data-page-shell]>[data-page-header]]:hidden"
          aria-busy={navigating}
          onClickCapture={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
            if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download") || !/^https?:$/.test(link.protocol)) return;
            const rawHref = link.getAttribute("href");
            if (rawHref?.startsWith("#")) return;
            event.preventDefault();
            event.stopPropagation();
            navigate(link.href);
          }}
          onSubmitCapture={event => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-settings-panel-filter")) return;
            event.preventDefault();
            event.stopPropagation();
            const params = new URLSearchParams();
            new FormData(form).forEach((value, key) => {
              if (typeof value === "string") params.set(key, value);
            });
            navigate(sourceHref + "?" + params);
          }}
        >
          {navigating ? (
            <p role="status" className="pointer-events-none absolute right-4 top-3 z-10 rounded-full bg-white/95 px-3 py-1 text-xs text-earth-500 shadow-sm">
              正在更新…
            </p>
          ) : null}
          <SettingsPanelContext.Provider value={context}>{children}</SettingsPanelContext.Provider>
        </div>
      </RightSheet>
    </div>
  );
}
