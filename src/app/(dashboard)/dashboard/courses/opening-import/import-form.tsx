"use client";
import { useActionState, useState } from "react";
import { submitMusicSourceImport, exportMusicSourceBatch, type MusicSourceImportState } from "@/server/actions/music-source-import";

const initial: MusicSourceImportState = { status: "IDLE", message: "選擇音教雲備份檔，先預覽資料。" };
export function OpeningImportForm() {
  // React resets uncontrolled fields after a successful form action. Retain
  // the File in this component only so the confirmation sends the same bytes.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [state, action, pending] = useActionState(async (previous: MusicSourceImportState, form: FormData) => {
    if (selectedFile) form.set("manifest", selectedFile);
    return submitMusicSourceImport(previous, form);
  }, initial);
  const [version, setVersion] = useState(0), [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("ALL"), [page, setPage] = useState(0);
  const [exportMessage, setExportMessage] = useState(""), [exporting, setExporting] = useState(false);
  const valid = state.status === "PREVIEW" && state.fileVersion === version;
  const preview = valid ? state.preview : undefined;
  const rows = preview?.rows.filter(r => (filter === "ALL" || r.disposition === filter) && `${r.name} ${r.phone} ${r.sourceStudentId}`.includes(search)) ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / 20)), currentPage = Math.min(page, pages - 1);
  async function download() {
    if (!state.batchId || exporting) return;
    setExporting(true); setExportMessage("");
    try {
      const result = await exportMusicSourceBatch(state.batchId);
      if (!result.success) { setExportMessage(result.message); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `音教雲批次-${state.batchId}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setExportMessage("已讀回並下載批次備份。");
    } catch { setExportMessage("下載失敗，請稍後重新讀回。"); }
    finally { setExporting(false); }
  }
  const locked = pending || state.status === "RECONCILE" || state.status === "IMPORTED";
  return <form action={action} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-white p-5">
    <p role="status" aria-live="polite" className="break-words text-base">{state.message}</p>
    <input type="hidden" name="fileVersion" value={version} /><input type="hidden" name="contentHash" value={valid ? state.contentHash : ""} /><input type="hidden" name="planHash" value={valid ? state.planHash : ""} />
    <label htmlFor="opening-manifest" className="text-base font-medium">1. 選擇來源備份檔</label>
    <input id="opening-manifest" name="manifest" type="file" accept="application/json,.json" required={!selectedFile} disabled={locked}
      onChange={event => { setSelectedFile(event.target.files?.[0] ?? null); setVersion(v => v + 1); setConfirmed(false); setPage(0); }} className="w-full min-w-0 rounded border p-3 text-base" />
    {selectedFile && <p className="break-words text-base">已選擇：{selectedFile.name}</p>}
    <p className="text-base text-gray-600">每批最多 100 位學生、500 KB。共用電話或既有資料差異先封存、待核對。</p>
    <button name="intent" value="preview" type="submit" disabled={locked} className="min-h-11 self-start rounded-lg border px-5 py-3 text-base disabled:opacity-50">{pending ? "處理中…" : "2. 預覽與核對"}</button>
    {preview && <section aria-label="來源預覽" className="min-w-0 space-y-4">
      <h2 className="text-base font-semibold">來源日期 {preview.sourceDate}</h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries({ 學生: preview.counts.students, 學費: preview.counts.tuition, 簽到及請假: preview.counts.attendance, 排課: preview.counts.schedule }).map(([label, count]) => <div key={label} className="rounded border p-3"><dt className="text-base text-gray-600">{label}</dt><dd className="text-lg font-semibold">{count} 筆</dd></div>)}</dl>
      <p className="text-base">新增 {preview.create} 位 · 已存在 {preview.existing} 位 · 待核對 {preview.review} 位</p>
      <div className="flex flex-wrap gap-3"><label className="flex min-w-0 flex-1 flex-col gap-1">搜尋學生<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="min-h-11 min-w-0 rounded border px-3 text-base" /></label><label className="flex flex-col gap-1">處理狀態<select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} className="min-h-11 rounded border px-3 text-base"><option value="ALL">全部</option><option value="CREATE">可新增</option><option value="EXISTING">已存在</option><option value="REVIEW">待核對</option></select></label></div>
      <div className="divide-y rounded border">{rows.slice(currentPage * 20, (currentPage + 1) * 20).map(row => <details key={row.sourceStudentId} className="p-3">
        <summary className="min-h-11 cursor-pointer break-words text-base">{row.name} · {row.phone || "未提供電話"} · {row.disposition === "CREATE" ? "可新增" : row.disposition === "EXISTING" ? "已存在" : "待核對"}</summary>
        <p className="my-2 break-words text-base text-gray-600">{row.reason}</p>{row.warnings.map(w => <p key={w} className="text-base text-orange-700">{w}</p>)}
        <div className="max-h-96 overflow-auto"><table className="w-full min-w-[560px] text-left text-base"><caption className="text-left font-medium">歷史學費（原文）</caption><thead><tr>{["期數", "方案", "期限", "應收", "實收", "欠款"].map(x => <th key={x} scope="col" className="p-2">{x}</th>)}</tr></thead><tbody>{row.tuition.map((t, i) => <tr key={i}><td className="p-2">{t.period}</td><td className="p-2">{t.charge}</td><td className="p-2">{t.expiry}</td><td className="p-2">{t.due ?? "待核對"}</td><td className="p-2">{t.received ?? "待核對"}</td><td className="p-2">{t.debt ?? "待核對"}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-base font-medium">簽到／請假（原文）</p>{row.attendance.map((r, i) => <p key={i} className="break-words text-base">{r.attendanceDateRaw || "未簽到"} · {r.leaveDateRaw || "無請假日期"} · {r.teacherName}</p>)}
        <p className="mt-3 text-base font-medium">排課（原文）</p>{row.schedule.map((r, i) => <p key={i} className="break-words text-base">{r.category} · {r.date} · {r.time} · {r.teacher}</p>)}
      </details>)}{rows.length === 0 && <p className="p-3 text-base">沒有符合條件的資料。</p>}</div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded border px-4 disabled:opacity-50">上一頁</button><span>第 {currentPage + 1}／{pages} 頁</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded border px-4 disabled:opacity-50">下一頁</button></div>
      <ul className="list-disc space-y-1 pl-5 text-base text-gray-600">{preview.limitations.map(x => <li key={x}>{x}</li>)}</ul>
      <label className="flex items-start gap-3 rounded border p-3 text-base"><input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} className="mt-1 h-5 w-5 shrink-0" /><span>我已核對這 {preview.counts.students} 位學生，確認封存來源並新增 {preview.create} 位基本資料。未核實的堂數、收入與 LINE 綁定不會啟用。</span></label>
      <button name="intent" value="commit" type="submit" disabled={!confirmed || pending} className="min-h-11 rounded-lg bg-blue-600 px-5 py-3 text-base text-white disabled:opacity-50">3. 確認匯入這一批</button>
    </section>}
    {state.batchId && <div className="space-y-2"><p className="break-all text-base">批次編號：{state.batchId}</p><button type="button" onClick={download} disabled={exporting} className="min-h-11 rounded border px-4">{exporting ? "讀回中…" : "下載已匯入的批次備份"}</button><p role="status" className="text-base">{exportMessage}</p>{state.status === "IMPORTED" && <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded border px-4">開始下一批</button>}</div>}
  </form>;
}
