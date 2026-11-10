// Design preview only. Synthetic ten-session plan; no account or database reads.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RightSheet} from '../../src/components/admin/right-sheet';
import {LessonProgressGrid,type CompletedLesson} from '../../src/components/admin/lesson-progress-grid';
const completed:CompletedLesson[]=[{id:'lesson-1',date:'2026-11-03T08:30:00Z',customerName:'合成學員'},{id:'lesson-2',date:'2026-11-10T08:30:00Z',customerName:'合成學員'}];
function Fixture(){
 const [selected,setSelected]=useState<CompletedLesson|null>(null);
 return <><main className="p-6 text-earth-600"><h1 className="font-semibold text-primary-900">課表排程</h1><p className="text-sm">2026/11/10 · 月表</p></main><RightSheet open presentation="centered" width={640} fitContent maxHeight={680} labelledById="progress-preview-title" onClose={()=>{}}><header className="flex items-center justify-between gap-3 border-b border-earth-200 px-5 py-3"><h2 id="progress-preview-title" className="text-base font-semibold text-primary-900">合成學員 · 方案詳情</h2><button className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm" onClick={()=>setSelected(null)}>關閉</button></header><div className="space-y-5 overflow-y-auto p-5"><section className="flex flex-wrap items-start justify-between gap-2 text-sm"><div><h3 className="font-semibold text-primary-900">舞蹈十堂方案</h3><p className="mt-1 text-earth-600">期限：2027/01/01</p></div><span className="font-medium text-primary-800">剩餘 8 堂</span></section><LessonProgressGrid total={10} completed={completed} onSelect={setSelected}/>{selected&&<p role="status" className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">{selected.date.slice(0,10)} · {selected.customerName} · 已上課</p>}<details className="border-t border-earth-100 pt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-800">查看完整紀錄</summary><p className="py-2 text-sm text-earth-600">上課、請假、扣堂及更正明細由此查看。</p></details></div></RightSheet></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
