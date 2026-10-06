"use client";
import { useEffect,useRef,useState,useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { saveCourseSetupReminder } from "@/server/actions/course-setup";
import { setupReminderVisible } from "@/lib/course-setup-progress";
type Step={id:string;label:string;done:boolean;href:string;hint:string};
export function CourseSetupGuide({steps,preference,login,manual=false}:{steps:Step[];preference:{mode:"show"|"later"|"never";login?:string};login:string;manual?:boolean}) {
  const completed=steps.every(s=>s.done),count=steps.filter(s=>s.done).length;
  const pathname=usePathname(),router=useRouter(),lastPath=useRef(pathname);
  useEffect(()=>{if(lastPath.current!==pathname){lastPath.current=pathname;router.refresh();}},[pathname,router]);
  const [visible,setVisible]=useState(setupReminderVisible(preference.mode,preference.login,login,completed));
  const [open,setOpen]=useState(false),[error,setError]=useState("");
  const [pending,start]=useTransition();
  const next=steps.find(s=>!s.done);
  function remind(mode:"show"|"later"|"never") {start(async()=>{const r=await saveCourseSetupReminder(mode);if(!r.success){setError(r.error);return;}setError("");setVisible(mode==="show");setOpen(false);});}
  return <>
    {manual?<button type="button" className="min-h-11 px-3 text-sm font-medium text-primary-800" onClick={()=>setOpen(true)}>開始設定 · {count}/{steps.length}</button>:visible&&!completed?<section aria-label="開始設定" className="flex flex-wrap items-center gap-2 rounded-xl border border-earth-200 bg-primary-50/50 px-4 py-2 text-sm"><strong className="text-primary-900">開始設定</strong><span className="text-earth-600">已完成 {count}/{steps.length}</span>{next&&<DashboardLink href={next.href} className="inline-flex min-h-11 items-center px-3 font-medium text-primary-800">下一步：{next.label} →</DashboardLink>}<button type="button" className="ml-auto min-h-11 px-3 font-medium text-primary-800" onClick={()=>setOpen(true)}>查看全部步驟 →</button><button type="button" disabled={pending} className="min-h-11 px-2 text-earth-600" onClick={()=>remind("later")}>稍後設定</button><button type="button" disabled={pending} className="min-h-11 px-2 text-earth-600" onClick={()=>remind("never")}>不再提醒</button></section>:null}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {open&&<RightSheet open presentation="centered" fitContent width={720} labelledById="course-setup-title" onClose={()=>{if(!pending)setOpen(false);}}><header className="flex items-center justify-between border-b border-earth-100 px-4 py-2"><h2 id="course-setup-title" className="font-semibold text-primary-900">開始設定 · {count}/{steps.length}</h2><button type="button" disabled={pending} className="min-h-11 px-3 text-sm" onClick={()=>setOpen(false)}>關閉</button></header><div className="min-h-0 overflow-y-auto p-4"><p className="mb-2 text-sm text-earth-600">已有資料的步驟已完成，從下一步繼續即可。</p><ol className="divide-y divide-earth-100">{steps.map((s,i)=><li key={s.id} className="flex items-center gap-3 py-2"><span className={s.done?"text-primary-700":"text-earth-500"}>{s.done?"✓":i+1}</span><div className="min-w-0 flex-1"><strong className="text-sm text-primary-900">{s.label}</strong><p className="text-sm text-earth-600">{s.hint}</p></div><DashboardLink href={s.href} className="inline-flex min-h-11 items-center px-3 text-sm text-primary-800">{s.done?"查看":"前往設定"} →</DashboardLink></li>)}</ol><div className="mt-2 flex flex-wrap gap-2 border-t border-earth-100 pt-2"><button type="button" disabled={pending} className="min-h-11 px-3 text-sm" onClick={()=>remind("later")}>稍後設定</button><button type="button" disabled={pending} className="min-h-11 px-3 text-sm" onClick={()=>remind("never")}>不再提醒</button>{manual&&!completed&&<button type="button" disabled={pending} className="min-h-11 px-3 text-sm text-primary-800" onClick={()=>remind("show")}>恢復登入提醒</button>}</div><p className="text-xs text-earth-500">提醒偏好保存在此瀏覽器；設定進度依本店資料更新。</p></div></RightSheet>}
  </>;
}
