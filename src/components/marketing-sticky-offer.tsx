"use client";

import { useEffect, useRef, useState } from "react";
import { getPublicAddonOffer, getPublicPricingOffer } from "@/lib/public-pricing-offer";
import styles from "./marketing-sticky-offer.module.css";

/** Public marketing footer only; excluded from store, HQ and LIFF layouts. */
export function MarketingStickyOffer() {
  const [now, setNow] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const addon = now === null ? null : getPublicAddonOffer(now);
  const annual = now === null ? null : getPublicPricingOffer(now);
  const offer = addon?.active ? addon : annual;
  const close = () => dialog.current?.close();
  return <>
    {offer?.active && <>
      <div className={styles.spacer} aria-hidden="true" />
      <aside aria-label="限時優惠與免費試用" className={styles.bar}>
        <div className={styles.inner}>
          <div className={styles.offer}>
            <a href={addon?.active ? "/pricing#addons" : "/pricing"} className={styles.details}>{addon?.active ? "雙十加購優惠" : "年繳再送 2 個月"}</a>
            <span role="timer" aria-live="off" aria-label="距離付款優惠截止" className={styles.timer}>剩 {offer.countdown[0]} 天 {offer.countdown.slice(1).map(value => String(value).padStart(2, "0")).join(":")}</span>
          </div>
          <button ref={trigger} type="button" className={styles.apply} aria-haspopup="dialog" onClick={() => { setLoaded(true); dialog.current?.showModal(); }}>免費試用 30 天</button>
        </div>
      </aside>
    </>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="marketing-trial-title" onClose={() => trigger.current?.focus({ preventScroll: true })}>
      <header className={styles.heading}>
        <h2 id="marketing-trial-title">申請免費試用</h2>
        <button type="button" className={styles.close} onClick={close} aria-label="關閉申請表">✕</button>
      </header>
      {/* Keep the existing form mounted after closing, preserving its draft. */}
      {loaded && <iframe ref={frame} src="/apply?intent=trial&embedded=1" title="蒸管家免費試用申請表" className={styles.frame} onLoad={() => {
        const doc = frame.current?.contentDocument;
        if (doc) doc.onkeydown = event => { if (event.key === "Escape") close(); };
      }} />}
    </dialog>
  </>;
}
