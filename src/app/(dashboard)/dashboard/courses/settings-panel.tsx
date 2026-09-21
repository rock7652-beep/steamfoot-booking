"use client";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsPanelContext, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { resolveDashboardHref } from "@/components/dashboard-link";
import { COURSE_SETTINGS_PANELS, courseSettingsPanelHref, type CourseSettingsPanel } from "@/lib/course-settings-panels";

class PanelError extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="p-6"><p>設定讀取失敗，請重試或關閉視窗。</p><button className="mt-3 min-h-11 rounded border px-4" onClick={() => { this.setState({ failed: false }); this.props.retry(); }}>重新讀取</button></div> : this.props.children;
  }
}

export function CourseSettingsPanel({ panel, children }: { panel: CourseSettingsPanel; children: ReactNode }) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const searchString = search.toString();
  const config = COURSE_SETTINGS_PANELS[panel];
  const [states, setStates] = useState<Record<string, SettingsPanelState>>({});
  const [destination, setDestination] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const dirty = Object.values(states).some(state => state.dirty);
  const pending = Object.values(states).some(state => state.pending);
  const report = useCallback((id: string, state: SettingsPanelState | null) => setStates(previous => {
    if (state && previous[id]?.dirty === state.dirty && previous[id]?.pending === state.pending) return previous;
    const next = { ...previous }; if (state) next[id] = state; else delete next[id]; return next;
  }), []);
  const closeHref = useMemo(() => {
    const params = new URLSearchParams(searchString); params.delete("panel"); params.delete("panelQuery");
    return `${pathname}?${params}`;
  }, [pathname, searchString]);
  const go = useCallback((href: string) => {
    setDestination(null);
    startNavigation(() => router.replace(href, { scroll: false }));
  }, [router]);
  const request = useCallback((href: string) => { if (dirty || pending) setDestination(href); else go(href); }, [dirty, pending, go]);
  const navigate = useCallback((href: string) => {
    const url = new URL(href.startsWith("?") ? config.href + href : href, window.location.origin);
    const localPath = url.pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)|^\/hq(?=\/dashboard)/, "");
    if (url.origin === window.location.origin) {
      if ((localPath === "/dashboard/courses" && url.searchParams.get("view") === "settings") || localPath === "/dashboard/settings" || localPath === "/dashboard") { request(closeHref); return; }
      const mapped = courseSettingsPanelHref(localPath + url.search);
      if (mapped !== localPath + url.search) {
        const params = new URLSearchParams(searchString); params.delete("panelQuery");
        new URLSearchParams(mapped.split("?")[1]).forEach((value, key) => params.set(key, value));
        request(resolveDashboardHref(`/dashboard/courses?${params}`, pathname)); return;
      }
    }
    request(url.href);
  }, [config.href, closeHref, pathname, request, searchString]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || pending) { event.preventDefault(); event.returnValue = ""; } };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Nested editors own Escape while they are open.
      if (root.current?.querySelector('[data-right-sheet][aria-hidden="false"] [data-right-sheet][aria-hidden="false"], [role="alertdialog"]')) return;
      event.preventDefault(); if (destination) setDestination(null); else request(closeHref);
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("keydown", escape); };
  }, [dirty, pending, request, closeHref, destination]);
  const context = useMemo(() => ({ report, navigate }), [report, navigate]);
  return <div ref={root} data-course-settings-panel className="[&>[data-right-sheet]]:z-[45]">
    <RightSheet open compact width={config.width} closeOnEscape={false} onClose={() => request(closeHref)} labelledById="course-settings-panel-title">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div><p className="text-xs text-earth-500">設定</p><h2 id="course-settings-panel-title" className="font-semibold text-primary-900">{config.title}</h2></div>
        <button type="button" onClick={() => request(closeHref)} className="min-h-11 shrink-0 rounded-lg border px-4">關閉視窗</button>
      </header>
      {destination && <div role="alert" className="shrink-0 border-b border-amber-200 bg-amber-50 p-4">
        <p className="font-medium">{pending ? "設定仍在儲存，請稍候。" : "尚有未儲存的修改，要捨棄嗎？"}</p>
        <div className="mt-2 flex gap-3"><button autoFocus className="min-h-11 rounded border px-3" onClick={() => setDestination(null)}>繼續編輯</button>{!pending && <button className="min-h-11 rounded bg-primary-700 px-3 text-white" onClick={() => go(destination)}>捨棄修改並繼續</button>}</div>
      </div>}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [&>[data-page-shell]]:px-4" aria-busy={navigating}
        onClickCapture={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
          if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download") || !/^https?:$/.test(link.protocol)) return;
          event.preventDefault(); event.stopPropagation(); navigate(link.href);
        }}
        onSubmitCapture={event => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-settings-panel-filter")) return;
          event.preventDefault(); event.stopPropagation();
          const params = new URLSearchParams(); new FormData(form).forEach((value, key) => { if (typeof value === "string") params.set(key, value); });
          navigate(config.href + "?" + params);
        }}>
        {navigating && <p role="status" className="sticky top-0 z-10 bg-white p-3 text-sm">正在更新…</p>}
        <SettingsPanelContext.Provider value={context}><PanelError retry={() => router.refresh()}>{children}</PanelError></SettingsPanelContext.Provider>
      </div>
    </RightSheet>
  </div>;
}
