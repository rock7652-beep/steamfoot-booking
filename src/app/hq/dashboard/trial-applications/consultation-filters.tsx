"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RosterToolbar } from "@/components/admin/roster-primitives";
import { CONSULTATION_LEAD_STATUSES } from "@/lib/consultation-lead";
import { applicationStatuses } from "@/lib/trial-application";
import { consultationHref, parseConsultationSearch, type ConsultationSearch } from "./consultation-view";

type Draft = Pick<ConsultationSearch, "stage" | "q" | "status">;
const draftFrom = ({ stage, q, status }: Draft): Draft => ({ stage, q, status });
const signature = (draft: Draft) => consultationHref({ stage: draft.stage, q: draft.q.trim(), status: draft.status });

/** Draft filters are independent of delayed RSC props; all results are queried server-side. */
export function ConsultationFilters({ search }: { search: ConsultationSearch }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(search));
  const latest = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const issued = useRef(new Set<string>());
  const expected = useRef<string | null>(null);
  const rendered = useRef(signature(search));
  const [pending, startTransition] = useTransition();
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState("");
  const incoming = signature(search);

  function cancelTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => {
    // Back/Forward must cancel even a debounce which has not navigated yet.
    const restore = (query = window.location.search) => {
      cancelTimer(); composing.current = false;
      const next = draftFrom(parseConsultationSearch(Object.fromEntries(new URLSearchParams(query))));
      latest.current = next;
      expected.current = signature(next);
      setDraft(next); setWaiting(false); setNotice("");
    };
    const popstate = () => restore();
    // Pagination, an empty-state reset and deep-link navigation are authoritative
    // too. Cancel a pending keyword before Next's Link handles that click.
    const followLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      cancelTimer(); composing.current = false; setWaiting(false);
      if (url.origin === window.location.origin && url.pathname === "/hq/dashboard/trial-applications") restore(url.search);
    };
    window.addEventListener("popstate", popstate);
    document.addEventListener("click", followLink, true);
    return () => { cancelTimer(); window.removeEventListener("popstate", popstate); document.removeEventListener("click", followLink, true); };
  }, []);
  // Synchronize external server-route state without overwriting an in-flight draft.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (incoming === rendered.current) return;
    rendered.current = incoming;
    // Never replace a newer draft with an older response. Next's router owns
    // request cancellation; this guard additionally protects controlled inputs.
    if (expected.current) {
      if (incoming !== expected.current) return;
      expected.current = null;
      if (!timer.current && incoming === signature(latest.current)) setWaiting(false);
      return;
    }
    if (timer.current || composing.current || issued.current.has(incoming)) return;
    const next = draftFrom(search);
    latest.current = next; setDraft(next); setWaiting(false);
  }, [incoming, search]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function navigate(next: Draft, push = false) {
    cancelTimer();
    const href = signature(next);
    expected.current = href;
    issued.current.add(href);
    // A new query discards only selection and paging, never a saved record.
    // Consultation editor drafts remain scoped to the same HQ account.
    setWaiting(true);
    if (document.querySelector('[data-intake-dirty="true"]')) setNotice("未儲存的輸入已保留；返回原紀錄可繼續編輯。");
    startTransition(() => {
      if (push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  }
  function update(patch: Partial<Draft>, immediate: boolean) {
    cancelTimer();
    const next = { ...latest.current, ...patch };
    latest.current = next; setDraft(next);
    if (composing.current && !immediate) return;
    if (immediate) navigate(next);
    else {
      setWaiting(true);
      timer.current = setTimeout(() => navigate(latest.current), 250);
    }
  }
  const statuses = draft.stage === "consultations" ? CONSULTATION_LEAD_STATUSES : applicationStatuses;
  const hasFilters = Boolean(draft.q || draft.status || search.lead || search.application || search.page > 1);
  const updating = pending || (waiting && signature(draft) !== incoming);
  return <div className="space-y-2">
    <nav aria-label="申請階段" className="flex flex-wrap gap-2">
      {([['consultations', '需求諮詢'], ['applications', '體驗版開通資料']] as const).map(([stage, label]) => <a
        key={stage} href={consultationHref({ stage, q: draft.q.trim() })} aria-current={draft.stage === stage ? "page" : undefined}
        className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${draft.stage === stage ? "border-primary-600 text-primary-800" : "border-transparent text-earth-600 hover:bg-earth-100"}`}
        onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); composing.current = false;
          const next = { ...latest.current, stage, status: undefined };
          latest.current = next; setDraft(next); navigate(next, true);
        }}>{label}</a>)}
    </nav>
    <form onSubmit={event => { event.preventDefault(); if (!composing.current) navigate(latest.current); }}>
      <RosterToolbar label="即時篩選申請">
        <label className="min-w-0 flex-[1_1_18rem] text-sm">
          <span className="sr-only">搜尋目前階段</span>
          <input name="q" value={draft.q} maxLength={200} autoComplete="off"
            aria-label="搜尋目前階段" aria-describedby="intake-filter-state"
            placeholder={draft.stage === "consultations" ? "搜尋店家、聯絡人、電話、LINE ID、收件編號" : "搜尋店家或 Email"}
            className="min-h-11 w-full min-w-0 rounded-lg border border-earth-300 bg-white px-3 py-2"
            onChange={event => update({ q: event.target.value }, false)}
            onCompositionStart={() => { composing.current = true; cancelTimer(); }}
            onCompositionEnd={event => { composing.current = false; update({ q: event.currentTarget.value }, false); }} />
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span>狀態</span>
          <select name="status" value={draft.status ?? ""} aria-label="處理狀態" className="min-h-11 max-w-full rounded-lg border border-earth-300 bg-white px-3 py-2"
            onChange={event => update({ status: event.target.value || undefined }, true)}>
            <option value="">全部狀態</option>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {hasFilters && <button type="button" className="min-h-11 min-w-11 px-2 text-sm text-primary-800 underline" onClick={() => {
          composing.current = false; update({ q: "", status: undefined }, true);
        }}>清除篩選</button>}
        <span id="intake-filter-state" role="status" className="text-sm text-earth-600">{updating ? "更新中…" : "即時篩選全部資料"}</span>
      </RosterToolbar>
    </form>
    {notice && <p role="status" className="text-sm text-amber-900">{notice}</p>}
  </div>;
}
