"use client";

import { useCallback, useEffect, useId,useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "@/components/use-stable-router";
import { usePathname, useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsPanelContext, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { ADMIN_SETTINGS_PANEL } from "@/lib/admin-ui";

export function SettingsPanel({
  title,
  sourceHref,
  width = ADMIN_SETTINGS_PANEL.width,
  children,
  navigateLocal, closeTarget, onSaved,
}: {
  title: string;
  sourceHref: string;
  width?: number;
  children: ReactNode;
  navigateLocal?: (href:string)=>void; closeTarget?:string; onSaved?:()=>void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const searchString = search.toString();
  const [states, setStates] = useState<Record<string, SettingsPanelState>>({});
  const [destination, setDestination] = useState<string | (()=>void) | null>(null);
  const [navigating, startNavigation] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const currentHref=useRef("");
  const trapId=useId(),backTarget=useRef<string|null>(null),backSteps=useRef(0),allowPop=useRef(false);
  useEffect(()=>{currentHref.current=window.location.href;},[searchString]);

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
    if(closeTarget)return closeTarget;
    const params = new URLSearchParams(searchString);
    params.delete("panel");
    params.delete("panelQuery");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchString, closeTarget]);

  const go = useCallback((href: string|(()=>void)) => {
    setDestination(null);
    if(typeof href==="function"){backTarget.current=null;href();return;}
    if(backTarget.current===href&&backSteps.current){backTarget.current=null;allowPop.current=true;window.history.go(backSteps.current);return;}
    backTarget.current=null;
    if(navigateLocal)navigateLocal(href);
    else startNavigation(() => router.replace(href, { scroll: false }));
  }, [router,navigateLocal]);

  const request = useCallback((href: string|(()=>void)) => {
    if (dirty || pending) setDestination(()=>href);
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

  useEffect(()=>{
    if(!navigateLocal)return;
    if(dirty||pending){
      if(window.history.state?.__settingsDraftTrap!==trapId){
        currentHref.current=window.location.href;
        window.history.pushState({...window.history.state,__settingsDraftTrap:trapId},"",window.location.href);
      }
    }else if(window.history.state?.__settingsDraftTrap===trapId){
      allowPop.current=true;window.history.back();
    }
  },[dirty,pending,navigateLocal,trapId]);

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
    const pop=(event:PopStateEvent)=>{
      if(allowPop.current){allowPop.current=false;return;}
      if(!navigateLocal||(!dirty&&!pending))return;
      // The same-URL entry keeps Next from unmounting the editor before this listener runs.
      const previous=window.history.state?.__settingsPreviousHref;
      const target=typeof previous==="string"?previous:closeHref;
      backSteps.current=typeof previous==="string"?-2:0;
      event.stopImmediatePropagation();
      window.history.pushState({...window.history.state,__settingsDraftTrap:trapId},"",currentHref.current);
      backTarget.current=target;
      setDestination(target);
    };
    window.addEventListener("popstate",pop,true);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("popstate",pop,true);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("keydown", escape);
    };
  }, [dirty, pending, request, closeHref, destination,navigateLocal,trapId]);

  const context = useMemo(() => ({ report, navigate: navigateLocal ? request : navigate, saved:onSaved,discard:request,local:!!navigateLocal }), [report, navigate, navigateLocal, request, onSaved]);

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
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
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
            <div className="mt-2 flex flex-wrap gap-3">
              <button autoFocus className="min-h-11 rounded border px-3 text-sm" onClick={() => {backTarget.current=null;setDestination(null);}}>繼續編輯</button>
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
            if(navigateLocal)request(link.href);else navigate(link.href);
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
            if(navigateLocal)request(sourceHref+"?"+params);else navigate(sourceHref + "?" + params);
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
