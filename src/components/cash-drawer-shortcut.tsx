"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPEN_EVENT = "steamfoot:open-cash-drawer";
const MESSAGE = "steamfoot:cash-drawer-panel";

export function CashDrawerOpenButton({ storeId, children }: { storeId: string; children: React.ReactNode }) {
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: storeId }))} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary-800 hover:bg-primary-50">{children}</button>;
}

/** A status summary only; amounts and operations remain in the authoritative workspace. */
export function CashDrawerHomeStatus({ storeId, initialStatus }: { storeId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.storeId === storeId) setStatus(detail.status);
    };
    window.addEventListener("steamfoot:cash-drawer-status", handler);
    return () => window.removeEventListener("steamfoot:cash-drawer-status", handler);
  }, [storeId]);
  return <div className="flex min-h-11 flex-wrap items-center justify-between gap-2"><strong className="text-sm text-primary-900">{status}</strong><CashDrawerOpenButton storeId={storeId}>開啟現金抽屜 →</CashDrawerOpenButton></div>;
}

/** The existing server workspace owns all reads and writes. The parent page
 * stays mounted; only the embedded document reloads after a successful write. */
export function CashDrawerShortcut({ storeId, prefix }: { storeId: string; prefix: string }) {
  const [open, setOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const busy = useRef(false);
  const titleId = useId();
  const params = new URLSearchParams({ cashDrawerPanel: "1", panelStoreId: storeId, panelPrefix: prefix });
  const href = `${prefix}/dashboard/cash-drawer?${params}`;
  function start() { dirty.current = false; busy.current = false; setIsBusy(false); setStatus(""); setReady(false); setFailed(false); setOpen(true); }
  function close() {
    if (busy.current) return;
    if (dirty.current && !window.confirm("尚未儲存，確定要關閉現金抽屜嗎？")) return;
    setOpen(false);
  }
  useEffect(() => {
    const handler = (event: Event) => { if ((event as CustomEvent).detail === storeId) start(); };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, [storeId]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setFailed(true), 30000);
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== MESSAGE || event.data.storeId !== storeId) return;
      if (event.data.escape) { close(); return; }
      dirty.current = event.data.dirty === true;
      busy.current = event.data.busy === true;
      setIsBusy(busy.current);
      if (["未開店", "營業中", "已結帳", "前次尚未結帳"].includes(event.data.status)) {
        setStatus(event.data.status);
        window.dispatchEvent(new CustomEvent("steamfoot:cash-drawer-status", { detail: { storeId, status: event.data.status } }));
      }
      setReady(true); setFailed(false); window.clearTimeout(timer);
    };
    window.addEventListener("message", handler);
    return () => { window.clearTimeout(timer); window.removeEventListener("message", handler); };
  }, [open, retry, storeId]);
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={start} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary-800 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600">
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 14h6"/></svg>現金抽屜{status && <span className="hidden xl:inline text-xs font-normal text-earth-500">· {status}</span>}
    </button>
    {open && createPortal(<dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} className="m-auto h-[min(900px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(1100px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-earth-200 bg-white p-0 shadow-xl backdrop:bg-black/35">
      <div className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-earth-200 px-4 py-2"><h2 id={titleId} className="font-semibold text-primary-900">現金抽屜</h2><button type="button" disabled={isBusy} onClick={close} className="min-h-11 min-w-11 rounded-lg px-2 text-sm text-earth-700 hover:bg-earth-50 disabled:opacity-50">{isBusy ? "處理中…" : "關閉"}</button></header>
        <div className="relative min-h-0 flex-1">
          {!ready && <div role={failed ? "alert" : "status"} className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white text-sm text-earth-600">{failed ? "現金抽屜暫時無法讀取。" : "讀取現金抽屜…"}{failed && <button type="button" className="min-h-11 rounded-lg px-4 text-primary-800 hover:bg-primary-50" onClick={() => { setFailed(false); setReady(false); setRetry(value => value + 1); }}>重新讀取</button>}</div>}
          <iframe key={retry} ref={frame} title="現金抽屜工作台" tabIndex={0} src={href} className="h-full w-full border-0" />
        </div>
      </div>
    </dialog>, document.body)}
  </>;
}

/** Send no amounts or identities. Source + origin + store are checked by host. */
export function CashDrawerPanelBridge({ storeId, status = "" }: { storeId: string; status?: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    let dirty = false;
    const send = (escape = false) => window.parent.postMessage({ type: MESSAGE, storeId, status, dirty, busy: !!document.querySelector('button[type="submit"] .animate-spin, form fieldset:disabled'), escape }, window.location.origin);
    const changed = () => { dirty = true; send(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"], dialog[open]')) send(true);
    };
    const observer = new MutationObserver(() => send());
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    document.addEventListener("input", changed); document.addEventListener("change", changed);
    window.addEventListener("keydown", escape); send();
    return () => { observer.disconnect(); document.removeEventListener("input", changed); document.removeEventListener("change", changed); window.removeEventListener("keydown", escape); };
  }, [storeId, status]);
  return null;
}
