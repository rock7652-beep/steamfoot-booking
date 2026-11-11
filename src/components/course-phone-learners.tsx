"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { loadCoursePhoneSummary } from "@/server/actions/course-phone-summary";
import { LessonProgressGrid } from "@/components/admin/lesson-progress-grid";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

type Summary = Awaited<ReturnType<typeof loadCoursePhoneSummary>>;
type Learner = Extract<Summary, { success: true }>["learners"][number];

function Plan({ card }: { card: Learner["cards"][number] }) {
  const unit = card.unit === "SESSION" ? "堂" : "點";
  return <section className="cp-phone-plan" aria-label={card.name}>
    <h4>{card.name}{card.shared && <span className="cp-muted"> · 共用</span>}</h4>
    {card.grid && <LessonProgressGrid total={card.grid.total} completed={card.grid.dates.map((date,index)=>({id:`${card.id}:${index}`,date}))} columns={Math.min(card.grid.total,card.grid.total % 5 === 0 ? 5 : 4)} showSummary={false} gridClassName="cp-phone-grid" />}
    <p className="cp-muted">剩餘 {card.remaining} {unit} · 已預約 {card.held} {unit} · 可再約 {card.available} {unit}{card.closed ? " · 已結束" : card.expired ? " · 已到期" : ""}</p>
  </section>;
}

export function CoursePhoneLearners({ scope, revision = 0, disabled = false, children }: { scope: string; revision?: number; disabled?: boolean; children?: ReactNode }) {
  const reader = usePanelReader("course-phone-summary", loadCoursePhoneSummary, scope, 0);
  const [state, setState] = useState<{ scope: string; revision: number; result: Summary } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (disabled) return;
    let active = true;
    // A new server render must not reuse a read started before that revision.
    reader.invalidate();
    reader.read().then(result => { if (active) setState({ scope, revision, result }); })
      .catch(() => { if (active) setState({ scope, revision, result: { success: false, error: "目前無法讀取學員課程，請重試" } }); });
    return () => { active = false; };
  }, [reader, scope, revision, retry, disabled]);
  const result = state?.scope === scope ? state.result : null;
  const refreshing = !result || state?.revision !== revision;
  if (disabled || (result?.success && !result.learners.length)) return children ?? null;
  return <>
    <section className="cp-card cp-phone-group" aria-label="同電話學員課程" aria-busy={refreshing}>
      <header className="cp-phone-heading"><h2>我的學員</h2><button type="button" className="cp-text-action" disabled={refreshing} onClick={() => { setState(null); setRetry(value => value + 1); }}>{refreshing ? "更新中…" : "重新讀取"}</button></header>
      {!result && <p role="status">讀取學員課程…</p>}
      {result && !result.success && <p role="alert" className="cp-error">{result.error}</p>}
      {result?.success && result.learners.map(learner => <details key={learner.id} name={`phone-learners-${scope}`} className="cp-phone-learner">
        <summary><span><strong>{learner.name}</strong><span className="cp-phone-next">{learner.upcoming[0] ? `下次上課 ${formatTWDateTime(new Date(learner.upcoming[0].startsAt))}` : "尚無上課安排"}</span></span><span className="cp-phone-expand" aria-hidden="true">⌄</span></summary>
        <div className="cp-phone-learner-body">
          {learner.cards.filter(card => !card.closed && !card.expired).map(card => <Plan key={card.id} card={card} />)}
          {!learner.cards.some(card => !card.closed && !card.expired) && <p className="cp-muted">尚無有效方案</p>}
          {learner.cards.some(card => card.closed || card.expired) && <details className="cp-phone-history"><summary>歷史方案</summary>{learner.cards.filter(card => card.closed || card.expired).map(card => <Plan key={card.id} card={card} />)}</details>}
          <details className="cp-phone-history"><summary>課程紀錄</summary>
            {[...learner.upcoming, ...learner.history].map(lesson => <p key={lesson.id}>{lesson.dateOnly ? toLocalDateStr(new Date(lesson.startsAt)) : formatTWDateTime(new Date(lesson.startsAt))} · {lesson.name} · {lesson.status}{lesson.dateOnly && lesson.quantity > 1 ? ` · ${lesson.quantity} ${lesson.unitLabel}` : ""}</p>)}
            {!learner.upcoming.length && !learner.history.length && <p>尚無課程紀錄</p>}
            {learner.upcoming.length === 20 && <p className="cp-muted">顯示接下來 20 筆課程</p>}
            {!!learner.history.length && <p className="cp-muted">顯示最近 {learner.history.length} 筆過往課程</p>}
          </details>
        </div>
      </details>)}
    </section>
    {result && !result.success && children}
  </>;
}
