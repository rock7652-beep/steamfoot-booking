"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function FrontendPreviewSelector({ stores, storeId, role, query, people, personId, allowWork, previewHref, locked = false }: {
  stores: { id: string; name: string }[]; storeId: string; role: string; query: string;
  people: { id: string; name: string; phone?: string }[]; personId?: string; allowWork: boolean; previewHref: string | null; locked?: boolean;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [text, setText] = useState(query), [pending, start] = useTransition();
  const frameRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fitViewport = () => {
      // Document position stays stable while the outer page is scrolled.
      const top = frame.getBoundingClientRect().top + window.scrollY;
      frame.style.setProperty("--frontend-preview-height", `${Math.max(0, window.innerHeight - top - 48)}px`);
    };
    fitViewport();
    const observer = new ResizeObserver(fitViewport);
    observer.observe(frame.parentElement ?? frame);
    window.addEventListener("resize", fitViewport);
    return () => { observer.disconnect(); window.removeEventListener("resize", fitViewport); };
  }, []);
  function navigate(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  useEffect(() => {
    if (text === query) return;
    const timer = setTimeout(() => {
      const form = formRef.current;
      if (form) form.requestSubmit();
    }, 250);
    return () => clearTimeout(timer);
  }, [text, query]);
  return <div ref={frameRef} className="grid min-h-0 items-start gap-4 md:h-[var(--frontend-preview-height,calc(100dvh-200px))] md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] md:items-stretch"><form ref={formRef} aria-busy={pending} onSubmit={event => { event.preventDefault(); navigate({ q: text, personId: "" }); }} className="flex min-h-0 flex-col gap-3 md:overflow-y-auto">
    <label className="block shrink-0 text-sm">店家<select value={storeId} onChange={event => navigate({ storeId: event.target.value, role: "member", personId: "", q: "" })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3">{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
    {!locked && <><label className="block shrink-0 text-sm">角色<select value={role} onChange={event => navigate({ role: event.target.value, personId: "", q: "" })} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3"><option value="member">會員前台</option>{allowWork && <option value="work">工作前台</option>}</select></label>
    <label className="block shrink-0 text-sm">姓名／手機<input value={text} onChange={event => setText(event.target.value)} placeholder="搜尋人員" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3" /></label>
    <div className="min-h-11 max-h-[420px] overflow-y-auto md:max-h-none md:flex-1 rounded-lg border border-earth-200" aria-label="人員搜尋結果">{people.length ? people.map(person => <button key={person.id} type="button" disabled={pending || text !== query} aria-pressed={person.id === personId} onClick={() => navigate({ personId: person.id })} className={`block min-h-11 w-full border-b border-earth-100 px-3 py-3 text-left text-sm last:border-0 ${person.id === personId ? "bg-primary-50 text-primary-900" : "bg-white text-earth-800"}`}>{person.name}{person.phone && <span className="ml-2 text-earth-500">{person.phone}</span>}</button>) : <p className="p-3 text-sm text-earth-500">沒有符合條件的資料</p>}</div>
    <p role="status" className="shrink-0 text-sm text-earth-500">{pending ? "正在讀取…" : "最多顯示 30 筆，請輸入姓名或手機縮小範圍。"}</p></>}
  </form><section aria-label="手機前台預覽" className="min-h-0 min-w-0 rounded-xl border border-earth-200 bg-earth-50 p-2 md:flex md:items-center md:justify-center">{pending || text !== query ? <p role="status" className="py-12 text-center text-sm">正在切換，請稍候…</p> : locked ? <p className="py-12 text-center text-sm text-earth-500">尚未開通功能，請聯絡總部加購。</p> : previewHref ? <iframe key={previewHref} src={previewHref} title="唯讀前台預覽" sandbox="allow-scripts allow-same-origin" className="mx-auto block h-[calc(100dvh-120px)] w-full max-w-[430px] rounded-xl md:h-full border border-earth-200 bg-white" /> : <p className="py-12 text-center text-sm text-earth-500">選擇人員後顯示前台。</p>}</section></div>;
}
