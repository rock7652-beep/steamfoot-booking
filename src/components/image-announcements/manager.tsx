"use client";
import { useEffect, useRef, useState } from "react";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { announcementImageUrl, announcementStatus, type AnnouncementSnapshot, type ImageAnnouncement } from "@/lib/image-announcements";

type Draft = ImageAnnouncement & { file?: File; url: string; notice?: string };
const button = "min-h-11 min-w-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-40";
async function prepareImage(file: File): Promise<{ file: File; notice: string }> {
  if (!["image/jpeg", "image/png"].includes(file.type)) throw Error("請上傳 JPG 或 PNG 圖片");
  if (file.size > 20 * 1024 * 1024) throw Error("原始圖片請小於 20 MB");
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    if (width * height > 50_000_000) throw Error("圖片尺寸過大，請縮小後上傳");
    const a4 = Math.min(width, height) / Math.max(width, height);
    const notices = [];
    if (Math.abs(a4 - 210 / 297) > 0.035) notices.push("非 A4 比例，將保留完整圖片");
    if (Math.min(width, height) < 800) notices.push("解析度偏低，請確認放大後文字清楚");
    let scale = Math.min(1, 2400 / Math.max(width, height));
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (blob && blob.size <= 650_000) return { file: new File([blob], "announcement.jpg", { type: "image/jpeg" }), notice: notices.join("・") };
      scale *= 0.8;
    }
    throw Error("圖片壓縮失敗，請縮小圖片後重試");
  } finally { bitmap.close(); }
}
export function ImageAnnouncementManager({ initial, storeId, storeSlug, canManage }: { initial: AnnouncementSnapshot; storeId: string; storeSlug: string; canManage: boolean }) {
  const fromSnapshot = (snapshot: AnnouncementSnapshot): Draft[] => snapshot.items.map(item => ({ ...item, url: announcementImageUrl(storeSlug, item.id, true) }));
  const [saved, setSaved] = useState(initial);
  const [items, setItems] = useState<Draft[]>(() => fromSnapshot(initial));
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const urls = useRef(new Set<string>());
  const drag = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<string | null>(null);
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useCourseDraftGuard(dirty, pending);
  function changed(next: Draft[]) { setItems(next); setDirty(true); setMessage(""); setError(""); }
  function patch(id: string, values: Partial<Draft>) { changed(items.map(item => item.id === id ? { ...item, ...values } : item)); }
  function reorder(source: string, target: string) {
    const from = items.findIndex(item => item.id === source), to = items.findIndex(item => item.id === target);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); changed(next);
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const replacing = replacement.current;
    if (files.length > (replacing ? 1 : 5 - items.length)) { setError("最多 5 張圖片"); return; }
    setPending(true); setError("");
    try {
      const added: Draft[] = [];
      for (const original of Array.from(files)) {
        const prepared = await prepareImage(original);
        const url = URL.createObjectURL(prepared.file); urls.current.add(url);
        const old = items.find(item => item.id === replacing);
        added.push({ id: crypto.randomUUID(), enabled: old?.enabled ?? true, startsOn: old?.startsOn ?? "", endsOn: old?.endsOn ?? "", ...prepared, url });
      }
      changed(replacing ? items.map(item => item.id === replacing ? added[0] : item) : [...items, ...added]);
      if (replacing) setEditing(added[0].id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "圖片讀取失敗"); }
    finally { setPending(false); replacement.current = null; if (input.current) input.current.value = ""; }
  }
  async function save() {
    setPending(true); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.set("storeId", storeId); body.set("revision", String(saved.revision));
      body.set("items", JSON.stringify(items.map(({ id, startsOn, endsOn, enabled }) => ({ id, startsOn, endsOn, enabled }))));
      items.forEach(item => { if (item.file) body.set(item.id, item.file); });
      const response = await fetch("/api/image-announcements", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "儲存失敗");
      setSaved(result); setItems(fromSnapshot(result)); setDirty(false); setEditing(null); setMessage("已儲存 ✓");
      urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "儲存失敗，請重試"); }
    finally { setPending(false); }
  }
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-earth-600">最多 5 張・可拖曳排序・建議 A4 比例</p>
      {canManage && <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="text-sm text-earth-600">{pending ? "處理中…" : dirty ? "未儲存" : message}</span>
        {dirty && <button type="button" disabled={pending} className={button} onClick={() => { if (confirm("放棄尚未儲存的變更？")) { setItems(fromSnapshot(saved)); setDirty(false); setEditing(null); setError(""); } }}>取消</button>}
        <button type="button" disabled={pending || items.length >= 5} className={button} onClick={() => { replacement.current = null; input.current?.click(); }}>＋上傳圖片</button>
        <button type="button" disabled={!dirty || pending} className={`${button} border-primary-700 bg-primary-700 text-white`} onClick={save}>儲存</button>
      </div>}
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <input ref={input} type="file" accept="image/jpeg,image/png" multiple hidden onChange={event => void upload(event.target.files)} />
    {!items.length && <div className="rounded-xl border border-dashed border-earth-300 p-8 text-center text-sm text-earth-500">尚未上傳圖片</div>}
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] items-start gap-3">
      {items.map((item, position) => <article key={item.id} data-image-id={item.id} className="min-w-0 overflow-hidden rounded-xl border border-earth-200 bg-white" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (canManage && !pending && drag.current) reorder(drag.current, item.id); drag.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={`公告圖片 ${position + 1}`} className="h-48 w-full bg-earth-50 object-contain" />
        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-earth-700">{announcementStatus(item)}</span>{canManage && <button type="button" disabled={pending} className={button} onClick={() => setEditing(editing === item.id ? null : item.id)}>{editing === item.id ? "收合" : "編輯"}</button>}</div>
          {item.notice && <p className="text-sm text-amber-700">{item.notice}</p>}
          {canManage && <div className="flex gap-1">
            <button type="button" aria-label={`拖曳第 ${position + 1} 張圖片`} draggable={!pending} disabled={pending} className={`${button} touch-none cursor-grab`} onDragStart={() => { drag.current = item.id; }} onPointerDown={event => { if (event.pointerType !== "mouse") { drag.current = item.id; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerUp={event => { if (event.pointerType !== "mouse") { const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-image-id]")?.getAttribute("data-image-id"); if (target && drag.current) reorder(drag.current, target); drag.current = null; } }}>⠿</button>
            <button type="button" aria-label={`上移第 ${position + 1} 張圖片`} className={button} disabled={pending || !position} onClick={() => reorder(item.id, items[position - 1].id)}>↑</button>
            <button type="button" aria-label={`下移第 ${position + 1} 張圖片`} className={button} disabled={pending || position === items.length - 1} onClick={() => reorder(item.id, items[position + 1].id)}>↓</button>
          </div>}
          {editing === item.id && <fieldset disabled={pending} className="min-w-0 space-y-3 border-t border-earth-100 pt-3">
            <button type="button" className={`${button} w-full`} onClick={() => { replacement.current = item.id; input.current?.click(); }}>更換圖片</button>
            <label className="block text-sm">上架日期 {!item.startsOn && <span className="text-earth-500">（立即）</span>}<input aria-label={`第 ${position + 1} 張上架日期`} type="date" value={item.startsOn} onChange={event => patch(item.id, { startsOn: event.target.value })} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-earth-200 px-2" /></label>
            <label className="block text-sm">下架日期 {!item.endsOn && <span className="text-earth-500">（不限）</span>}<input aria-label={`第 ${position + 1} 張下架日期`} type="date" min={item.startsOn} value={item.endsOn} onChange={event => patch(item.id, { endsOn: event.target.value })} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-earth-200 px-2" /></label>
            {item.startsOn && item.endsOn && item.endsOn < item.startsOn && <p className="text-sm text-red-700">下架日期不可早於上架日期</p>}
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={event => patch(item.id, { enabled: event.target.checked })} />啟用</label>
            <button type="button" className={`${button} text-red-700`} onClick={() => { if (confirm("刪除此圖片？儲存後將從本店首頁移除，無法復原。")) { changed(items.filter(row => row.id !== item.id)); setEditing(null); } }}>刪除圖片</button>
          </fieldset>}
        </div>
      </article>)}
    </div>
  </div>;
}
