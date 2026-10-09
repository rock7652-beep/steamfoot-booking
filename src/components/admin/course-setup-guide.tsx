"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardLink, resolveDashboardHref } from "@/components/dashboard-link";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { saveCourseSetupReminder } from "@/server/actions/course-setup";
import { courseSetupHref, currentCourseSetupStep, setupReminderVisible, type CourseSetupStep } from "@/lib/course-setup-progress";

type Preference = { mode: "show" | "later" | "never"; login?: string };
export function CourseSetupGuide({ steps, preference, login, manual = false, studentHref }: {
  steps: CourseSetupStep[]; preference: Preference; login: string; manual?: boolean; studentHref?: string;
}) {
  const completed = steps.every(s => s.done), count = steps.filter(s => s.done).length;
  const pathname = usePathname(), router = useRouter(), params = useSearchParams();
  const route = `${pathname}?${params.toString()}`, lastRoute = useRef(route);
  useEffect(() => {
    if (lastRoute.current !== route) { lastRoute.current = route; router.refresh(); }
  }, [route, router]);
  useEffect(() => {
    if (manual) return;
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [manual, router]);
  const preferenceKey = `${preference.mode}:${preference.login ?? ""}`;
  const [reminderOverride, setReminder] = useState<(Preference & { source: string }) | null>(null);
  const reminder = reminderOverride?.source === preferenceKey ? reminderOverride : preference;
  const reminderEnabled = setupReminderVisible(reminder.mode, reminder.login, login, false);
  const [open, setOpen] = useState(false), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const next = steps.find(s => !s.done);
  const currentIndex = currentCourseSetupStep(steps, pathname, params.toString());
  const current = currentIndex >= 0 ? steps[currentIndex] : undefined;
  const previousSteps = useRef(steps);
  useEffect(() => {
    const previous = previousSteps.current;
    previousSteps.current = steps;
    if (manual || !reminderEnabled) return;
    const saved = steps.filter(step => step.done && previous.some(old => old.id === step.id && !old.done));
    if (!saved.length) return;
    toast.success(completed ? "基本設定已完成" : `${saved.map(step => step.label).join("、")} · 已完成`, {
      description: next ? `下一步：${next.label}` : "可查看課表，或在課程詳情加入學員。",
      duration: 10000,
      action: { label: next ? "繼續下一步" : "查看課表", onClick: () => router.push(resolveDashboardHref(next ? courseSetupHref(next) : "/dashboard/courses", pathname)) },
    });
  }, [steps, manual, reminderEnabled, completed, next, pathname, router]);
  function remind(mode: Preference["mode"]) {
    if (pending) return;
    start(async () => {
      const r = await saveCourseSetupReminder(mode);
      if (!r.success) { setError(r.error); return; }
      setError(""); setReminder({ mode, login, source: preferenceKey }); setOpen(false);
    });
  }
  const stepList = <ol className="divide-y divide-earth-100">{steps.map((s, i) => <li key={s.id} className="flex items-center gap-3 py-2">
    <span className={s.done ? "text-primary-700" : "text-earth-500"}>{s.done ? "✓" : i + 1}</span>
    <div className="min-w-0 flex-1"><strong className="text-sm text-primary-900">{s.label}</strong>
      {!s.done && <span className={`ml-2 text-sm ${s.status === "repair" ? "text-amber-800" : "text-earth-600"}`}>{s.status === "repair" ? "需修正" : "尚未設定"}</span>}
      <p className="text-sm text-earth-600">{s.hint}</p></div>
    <DashboardLink href={courseSetupHref(s)} onClick={() => setOpen(false)} className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm text-primary-800">{s.done ? "查看" : s.status === "repair" ? "前往修正" : "前往設定"} →</DashboardLink>
  </li>)}</ol>;
  return <>
    {manual ? <button type="button" className="min-h-11 px-3 text-sm font-medium text-primary-800" onClick={() => setOpen(true)}>{completed ? "設定完成" : "開始設定"} · {count}/{steps.length}</button>
      : (current || reminderEnabled && !completed) ? <section aria-label="開始設定" className="flex flex-wrap items-center gap-2 rounded-xl border border-earth-200 bg-primary-50/50 px-4 py-2 text-sm">
        <strong className="text-primary-900">{current ? `第 ${currentIndex + 1}/${steps.length} 步 · ${current.label}${current.done ? " · 已完成" : ""}` : "繼續設定"}</strong>
        <span className="text-earth-600">已完成 {count}/{steps.length}</span>
        {next ? <DashboardLink href={courseSetupHref(next)} className="inline-flex min-h-11 items-center px-3 font-medium text-primary-800">{current?.done ? "繼續下一步" : "下一步"}：{next.label} →</DashboardLink>
          : <DashboardLink href="/dashboard/courses" className="inline-flex min-h-11 items-center px-3 font-medium text-primary-800">查看課表 →</DashboardLink>}
        <button type="button" className="ml-auto min-h-11 px-3 font-medium text-primary-800" onClick={() => setOpen(true)}>查看全部步驟 →</button>
        {!current && <><button type="button" disabled={pending} className="min-h-11 px-2 text-earth-600" onClick={() => remind("later")}>稍後設定</button><button type="button" disabled={pending} className="min-h-11 px-2 text-earth-600" onClick={() => remind("never")}>不再提醒</button></>}
      </section> : null}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {open && <RightSheet open presentation="centered" fitContent width={720} labelledById="course-setup-title" onClose={() => { if (!pending) setOpen(false); }}>
      <header className="flex items-center justify-between border-b border-earth-100 px-4 py-2"><h2 id="course-setup-title" className="font-semibold text-primary-900">{completed ? "設定完成，可以開始上課了" : "開始設定"} · {count}/{steps.length}</h2><button type="button" disabled={pending} className="min-h-11 px-3 text-sm" onClick={() => setOpen(false)}>關閉</button></header>
      <div className="min-h-0 overflow-y-auto p-4">
        <p className="mb-2 text-sm text-earth-600">{completed ? "基本設定已完成；每次排課仍會核對公休、授課資格與空位。" : "從下一個未完成步驟繼續即可。"}</p>
        {completed ? <>
          <div className="mb-3 flex flex-wrap items-center gap-2"><DashboardLink href="/dashboard/courses" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-4 text-sm font-medium text-white">查看課表 →</DashboardLink>
            {studentHref && <DashboardLink href={studentHref} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center px-3 text-sm text-primary-800">加入學員 →</DashboardLink>}</div>
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-primary-800">查看設定明細</summary>{stepList}</details>
        </> : stepList}
        {!completed && <><div className="mt-2 flex flex-wrap gap-2 border-t border-earth-100 pt-2"><button type="button" disabled={pending} className="min-h-11 px-3 text-sm" onClick={() => remind("later")}>稍後設定</button><button type="button" disabled={pending} className="min-h-11 px-3 text-sm" onClick={() => remind("never")}>不再提醒</button>{manual && <button type="button" disabled={pending} className="min-h-11 px-3 text-sm text-primary-800" onClick={() => remind("show")}>恢復登入提醒</button>}</div><p className="text-sm text-earth-500">提醒偏好保存在此瀏覽器；設定進度依本店資料更新。</p></>}
      </div>
    </RightSheet>}
  </>;
}
