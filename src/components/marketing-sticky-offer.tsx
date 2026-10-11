"use client";

import { useEffect, useRef, useState } from "react";
import { getPublicAddonOffer, getPublicPricingOffer } from "@/lib/public-pricing-offer";
import styles from "./marketing-sticky-offer.module.css";

/** Public marketing footer only; excluded from store, HQ and LIFF layouts. */
export function MarketingStickyOffer() {
  const [now, setNow] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const source = useRef<string | null>(null);
  const [formSource, setFormSource] = useState("/apply?intent=trial&embedded=1");
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const restore = window.requestAnimationFrame(() => {
      try { setCollapsed(sessionStorage.getItem("marketing-offer-collapsed-v1") === "1"); } catch { /* Storage may be unavailable. */ }
      update();
    });
    const timer = window.setInterval(update, 1000);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.cancelAnimationFrame(restore);
      window.clearInterval(timer);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    const launch = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname !== "/apply" || ![window.location.origin, "https://www.steamfoot.com", "https://steamfoot.com"].includes(url.origin)) return;
      if (!dialog.current) return;
      event.preventDefault();
      event.stopPropagation();
      trigger.current = anchor;
      if (!source.current) {
        url.searchParams.set("intent", "trial");
        url.searchParams.set("embedded", "1");
        source.current = url.pathname + url.search;
        setFormSource(source.current);
      }
      setLoaded(true);
      dialog.current.showModal();
      setOpen(true);
    };
    document.addEventListener("click", launch, true);
    return () => document.removeEventListener("click", launch, true);
  }, []);
  const addon = now === null ? null : getPublicAddonOffer(now);
  const annual = now === null ? null : getPublicPricingOffer(now);
  const offer = addon?.active ? addon : annual;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { sessionStorage.setItem("marketing-offer-collapsed-v1", next ? "1" : "0"); } catch { /* Continue without persistence. */ }
  };
  const close = () => dialog.current?.close();
  return <>
    {offer?.active && <>
      {!collapsed && <div className={styles.spacer} aria-hidden="true" />}
      <aside aria-label="付款優惠" className={collapsed ? styles.collapsed : styles.bar} hidden={open}>
        {collapsed ? <button type="button" className={styles.reopen} aria-expanded={false} aria-controls="marketing-offer-details" aria-label="展開優惠倒數" onClick={toggle}>優惠 ⌃</button> :
          <div className={styles.inner}>
            <a id="marketing-offer-details" href={addon?.active ? "/pricing#double-ten-offer" : "/pricing#yearend-offer"} className={styles.offer}>
              <span className={styles.details}>{addon?.active ? "雙十加購優惠" : "年繳再送 2 個月"}</span>
              <span role="timer" aria-live="off" aria-label="距離付款優惠截止" className={styles.timer}>付款優惠剩 {offer.countdown[0]}天 {offer.countdown.slice(1).map(value => String(value).padStart(2, "0")).join(":")}</span>
            </a>
            <button type="button" className={styles.toggle} aria-expanded={true} aria-controls="marketing-offer-details" aria-label="收合優惠倒數" onClick={toggle}>⌄</button>
          </div>}
      </aside>
    </>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="marketing-trial-title" onClose={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }}>
      <header className={styles.heading}>
        <h2 id="marketing-trial-title">申請免費試用</h2>
        <button type="button" className={styles.close} onClick={close} aria-label="關閉申請表">✕</button>
      </header>
      {/* Keep the existing form mounted after closing, preserving its draft. */}
      {loaded && <iframe ref={frame} src={formSource} title="蒸管家免費試用申請表" className={styles.frame} onLoad={() => {
        const doc = frame.current?.contentDocument;
        if (doc) doc.onkeydown = event => { if (event.key === "Escape") close(); };
      }} />}
    </dialog>
  </>;
}
