"use client";

import { useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolveDashboardHref } from "@/components/dashboard-link";
import { SettingsPanelContext } from "@/components/admin/settings-panel-context";
import { toLocalDateStr } from "@/lib/date-utils";

type Props = {
  children?: ReactNode;
  label?: string;
  className?: string;
  id?: string;
  action?: string;
  preserveQuery?: boolean;
  panelAware?: boolean;
  onNavigationReset?: () => void;
  transformQuery?: (params: URLSearchParams, data: FormData) => void;
};

/** GET filters only: submit the complete current draft; never wrap mutations. */
export function InstantFilterForm({ children, label, className, id, action, preserveQuery = false, panelAware = false, onNavigationReset, transformQuery }: Props) {
  const router = useRouter(), pathname = usePathname(), panel = useContext(SettingsPanelContext);
  const formRef = useRef<HTMLFormElement>(null), resetOnNavigation = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), composing = useRef(false);
  const [pending, start] = useTransition(), [error, setError] = useState("");

  function cancel() {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  }
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, [pathname, action]);
  // External navigation uses new server defaults. Own responses must retain a newer typed draft.
  useEffect(() => {
    if (resetOnNavigation.current) {
      formRef.current?.reset(); onNavigationReset?.(); resetOnNavigation.current = false;
    }
  }, [children, onNavigationReset]);
  useEffect(() => {
    const reset = () => { if (timer.current !== null) clearTimeout(timer.current); resetOnNavigation.current = true; };
    const navigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === pathname && target.search !== window.location.search) reset();
    };
    window.addEventListener("popstate", reset); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("popstate", reset); document.removeEventListener("click", navigate, true); };
  }, [pathname]);

  function apply(form: HTMLFormElement, delay = 0) {
    cancel();
    if (composing.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const data = new FormData(form);
      const from = String(data.get("dateFrom") ?? data.get("from") ?? data.get("startDate") ?? "");
      const to = String(data.get("dateTo") ?? data.get("to") ?? data.get("endDate") ?? "");
      if ((from && !to) || (!from && to)) { setError("請填完整日期區間"); return; }
      if (from && to && from > to) { setError("結束日期不能早於開始日期"); return; }
      for (const key of data.keys()) {
        if (!key.endsWith("_min")) continue;
        const min = String(data.get(key) ?? ""), max = String(data.get(key.replace(/_min$/, "_max")) ?? "");
        if (min && max && Number(min) > Number(max)) { setError("最高值不能小於最低值"); return; }
      }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      setError("");
      if (data.has("dateMode") && data.has("dateTo")) data.set("dateMode", to === toLocalDateStr() ? "today" : "fixed");
      const base = new URL(action ? resolveDashboardHref(action, pathname) : pathname, window.location.origin);
      const params = new URLSearchParams(preserveQuery ? window.location.search : base.search);
      for (const key of new Set(data.keys())) params.delete(key);
      params.delete("page");
      data.forEach((value, key) => { if (typeof value === "string" && value.trim() && key !== "page") params.append(key, value.trim()); });
      transformQuery?.(params, data);
      const href = `${base.pathname}${params.size ? `?${params}` : ""}${base.hash}`;
      start(() => { if (panelAware && panel) panel.navigate(href); else router.replace(href, { scroll: false }); });
    }, delay);
  }

  return <form ref={formRef} id={id} className={className} aria-label={label} aria-busy={pending}
    onSubmit={event => { event.preventDefault(); apply(event.currentTarget); }}
    onClickCapture={event => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("a[href]")) { cancel(); resetOnNavigation.current = true; }
      else if (event.target.closest("[data-filter-change]")) apply(event.currentTarget);
    }}
    onCompositionStart={() => { composing.current = true; cancel(); }}
    onCompositionEnd={event => { composing.current = false; apply(event.currentTarget, 250); }}
    onChange={event => {
      resetOnNavigation.current = false;
      const field = event.target as unknown as HTMLInputElement;
      apply(event.currentTarget, field.tagName === "SELECT" || ["date", "month", "checkbox", "radio"].includes(field.type) || !field.value ? 0 : 250);
    }}>
    {children}
    {error ? <p role="alert" className="text-sm text-amber-700">{error}</p> : pending ? <p role="status" className="text-sm text-earth-500">更新中…</p> : null}
  </form>;
}
