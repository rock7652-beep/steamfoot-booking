"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./carousel.module.css";
import { ModalPanel } from "@/components/admin/modal-panel";
import { announcementImageUrl, type ImageAnnouncement } from "@/lib/image-announcements";

export function ImageAnnouncementCarousel({ items, storeSlug, preview = false }: { items: ImageAnnouncement[]; storeSlug: string; preview?: boolean }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [now, setNow] = useState(Date.now);
  const touch = useRef<number | null>(null);
  const swiped = useRef(false);
  const title = useId();
  // Recheck schedules even when a customer leaves this page open overnight.
  const active = preview ? items : items.filter(item => item.enabled && (!item.startsOn || Date.parse(`${item.startsOn}T00:00:00+08:00`) <= now) && (!item.endsOn || Date.parse(`${item.endsOn}T23:59:59.999+08:00`) >= now));
  const current = active[index % Math.max(active.length, 1)];
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (open || paused || active.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => { if (!document.hidden) setIndex(value => (value + 1) % active.length); }, 6000);
    return () => clearInterval(timer);
  }, [open, paused, active.length]);
  function move(delta: number) { setPaused(true); setZoom(false); setIndex(value => (value + delta + active.length) % active.length); }
  function close() { setOpen(false); setZoom(false); }
  if (!current) return null;
  const src = announcementImageUrl(storeSlug, current.id, preview);
  const dots = <div className={`${styles.dots} flex justify-center gap-1`} aria-label="圖片切換">{active.map((item, position) => <button key={item.id} type="button" aria-label={`第 ${position + 1} 張圖片`} aria-current={item.id === current.id ? "true" : undefined} className={`${styles.dotButton} flex h-11 w-11 items-center justify-center`} onClick={() => { setPaused(true); setZoom(false); setIndex(position); }}><span className={`h-2 w-2 rounded-full ${item.id === current.id ? "bg-primary-700" : "bg-earth-300"}`} /></button>)}</div>;
  const swipe = { onTouchStart: (event: React.TouchEvent) => { setPaused(true); swiped.current = false; touch.current = event.touches[0].clientX; }, onTouchEnd: (event: React.TouchEvent) => { if (!zoom && touch.current !== null) { const distance = event.changedTouches[0].clientX - touch.current; if (Math.abs(distance) > 45) { swiped.current = true; move(distance > 0 ? -1 : 1); } } touch.current = null; } };
  return <>
    <div data-image-announcements className={`${styles.carousel} min-w-0 rounded-xl bg-white ring-1 ring-earth-200`} {...swipe}>
      <div className={styles.slides} onPointerDown={() => { swiped.current = false; setPaused(true); }} onFocusCapture={() => setPaused(true)}>
        {active.map(item => {
          const selected = item.id === current.id;
          return <button key={item.id} type="button" aria-label="放大公告圖片" aria-hidden={!selected} inert={!selected} tabIndex={selected ? 0 : -1}
            className={`${styles.preview} ${selected ? styles.current : ""} relative w-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-primary-600`}
            onClick={() => { if (swiped.current) { swiped.current = false; return; } setPaused(true); setOpen(true); }}>
            {/* All slides share one grid cell. The tallest reserves space so
                different image proportions do not move the booking list. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={announcementImageUrl(storeSlug, item.id, preview)} alt="" className={styles.image} />
            <span aria-hidden="true" className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-earth-800"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M10 7v6M7 10h6" /></svg></span>
          </button>;
        })}
      </div>
      {active.length > 1 && dots}
    </div>
    <ModalPanel open={open} onClose={close} labelledById={title} width={1000}>
      <div className="flex max-h-[85dvh] min-h-0 flex-col bg-white p-2">
        <h2 id={title} className="sr-only">公告圖片</h2>
        <div className="flex shrink-0 justify-end gap-1">
          <button type="button" aria-label={zoom ? "縮小圖片" : "放大圖片"} className="h-11 w-11 rounded-lg border border-earth-200" onClick={() => setZoom(!zoom)}>{zoom ? "−" : "+"}</button>
          <button type="button" aria-label="關閉圖片" className="h-11 w-11 rounded-lg border border-earth-200" onClick={close}>×</button>
        </div>
        <div className="min-h-0 overflow-auto overscroll-contain" {...swipe}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`公告圖片 ${index % active.length + 1}`} style={zoom ? { width: "200%", maxWidth: "none" } : { maxHeight: "65dvh", maxWidth: "100%", margin: "auto", objectFit: "contain" }} />
        </div>
        {active.length > 1 && <div className="flex shrink-0 items-center justify-between"><button type="button" aria-label="上一張圖片" className="h-11 w-11" onClick={() => move(-1)}>‹</button>{dots}<button type="button" aria-label="下一張圖片" className="h-11 w-11" onClick={() => move(1)}>›</button></div>}
      </div>
    </ModalPanel>
  </>;
}

/** Public image-only data. No member data or shared authenticated read cache. */
export function StoreImageAnnouncements({ storeSlug }: { storeSlug: string }) {
  const [data, setData] = useState<{ slug: string; items: ImageAnnouncement[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    async function load() {
      const request = ++sequence;
      try {
        const response = await fetch(announcementImageUrl(storeSlug, "list"), { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const result = await response.json();
          if (!controller.signal.aborted && request === sequence) setData({ slug: storeSlug, items: result.items });
        }
      } catch { /* Optional announcements must not interrupt booking. */ }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const refresh = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [storeSlug]);
  return data?.slug === storeSlug ? <ImageAnnouncementCarousel key={storeSlug} items={data.items} storeSlug={storeSlug} /> : null;
}
