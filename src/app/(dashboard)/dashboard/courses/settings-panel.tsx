"use client";
import { ADMIN_SETTINGS_PANEL } from "@/lib/admin-ui";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoadingStatus } from "@/components/loading-status";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsPanelContext, useSettingsPanelDismissal, useSettingsPanelReaderHost, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { resolveDashboardHref } from "@/components/dashboard-link";
import { COURSE_SETTINGS_PANELS, courseSettingsPanelHref, type CourseSettingsPanel } from "@/lib/course-settings-panels";

class PanelError extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="p-6"><p>設定讀取失敗，請重試或關閉視窗。</p><button className="mt-3 min-h-11 rounded border px-4" onClick={() => { this.setState({ failed: false }); this.props.retry(); }}>重新讀取</button></div> : this.props.children;
  }
}

export function CourseSettingsPanel({ panel, children,workspaceHref="/dashboard/courses",confirmDiscard=true }: { panel: CourseSettingsPanel; children: ReactNode;workspaceHref?:string;confirmDiscard?:boolean }) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const searchString = search.toString();
  const { dismissed, dismiss } = useSettingsPanelDismissal(searchString);
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
  const { reader, registerReader } = useSettingsPanelReaderHost();
  const go = useCallback((href: string) => {
    setDestination(null);
    if (href === closeHref) { dismiss(href); return; }
    const reading = reader.current?.(href);
    if (reading) startNavigation(async () => { await reading; });
    else startNavigation(() => router.replace(href, { scroll: false }));
  }, [router, closeHref, dismiss, reader]);
  if(!pending&&destination!==null)setDestination(null);
  const request = useCallback((href: string) => { if (pending) setDestination(href); else go(href); }, [pending, go]);
  const navigate = useCallback((href: string) => {
    const url = new URL(href.startsWith("?") ? config.href + href : href, window.location.origin);
    const localPath = url.pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)|^\/hq(?=\/dashboard)/, "");
    if (url.origin === window.location.origin) {
      if ((localPath === "/dashboard/courses" && url.searchParams.get("view") === "settings") || localPath === "/dashboard/settings" || localPath === "/dashboard") { request(closeHref); return; }
      const mapped = courseSettingsPanelHref(localPath + url.search);
      if (mapped !== localPath + url.search) {
        const params = new URLSearchParams(searchString); params.delete("panelQuery");
        new URLSearchParams(mapped.split("?")[1]).forEach((value, key) => params.set(key, value));
        if(workspaceHref!=="/dashboard/courses"){params.delete("view");params.set("tab","設定");}
        request(resolveDashboardHref(`${workspaceHref}?${params}`, pathname)); return;
      }
    }
    request(url.href);
  }, [config.href, closeHref, pathname, request, searchString,workspaceHref]);
  useEffect(() => {
    if (dismissed) return;
    const unload = (event: BeforeUnloadEvent) => { if (pending) { event.preventDefault(); event.returnValue = ""; } };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Nested editors own Escape while they are open.
      if (root.current?.querySelector('[data-right-sheet][aria-hidden="false"] [data-right-sheet][aria-hidden="false"], [role="alertdialog"]')) return;
      event.preventDefault(); if (destination) setDestination(null); else request(closeHref);
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("keydown", escape); };
  }, [confirmDiscard,dirty, pending, request, closeHref, destination, dismissed]);
  useEffect(()=>{const body=root.current?.querySelector<HTMLElement>('[data-settings-panel-body]');if(body)body.scrollTop=0;},[panel,searchString]);
  const context = useMemo(() => ({ report, navigate, registerReader: panel === "reminders" ? registerReader : undefined }), [report, navigate, registerReader, panel]);
  return <div ref={root} data-course-settings-panel>
    <RightSheet presentation="centered" open={!dismissed} compact fixedHeight width={ADMIN_SETTINGS_PANEL.width} maxHeight={ADMIN_SETTINGS_PANEL.maxHeight} closeOnEscape={false} onClose={() => request(closeHref)} labelledById="course-settings-panel-title">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div><p className="text-xs text-earth-500">設定</p><h2 id="course-settings-panel-title" className="font-semibold text-primary-900">{config.title}</h2></div>
        <button type="button" onClick={() => request(closeHref)} className="min-h-11 shrink-0 rounded-lg border px-4">關閉視窗</button>
      </header>
      {navigating && <div data-panel-navigation-status className="shrink-0 border-b border-primary-100 bg-primary-50 px-4"><LoadingStatus>正在切換，請稍候…</LoadingStatus></div>}
      {destination && <div role="alert" className="shrink-0 border-b border-amber-200 bg-amber-50 p-4">
        <p className="font-medium">設定仍在儲存，請稍候。</p>
        <button autoFocus className="mt-2 min-h-11 rounded border px-3" onClick={() => setDestination(null)}>繼續編輯</button>
      </div>}
      <div data-settings-panel-body className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [&_[data-page-shell]]:px-4 [&_[data-page-shell]>[data-page-header]]:hidden [&_[data-settings-return]]:hidden [&_[data-panel-secondary-title]]:hidden" aria-busy={navigating}
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
        <SettingsPanelContext.Provider value={context}><PanelError key={panel} retry={() => router.refresh()}>{dismissed ? null : children}</PanelError></SettingsPanelContext.Provider>
      </div>
    </RightSheet>
  </div>;
}
