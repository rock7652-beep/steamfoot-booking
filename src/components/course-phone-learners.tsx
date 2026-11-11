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
    <div className="cp-phone-plan-heading"><h4>{card.name}{card.shared && <span className="cp-muted"> · 共用</span>}</h4><strong>剩餘 {card.remaining} {unit}</strong></div>
    {(card.purchase||card.expiresAt||card.activationDays||card.closed||card.expired)&&<p className="cp-muted cp-phone-plan-meta">
      {card.purchase&&<><span>購買 {toLocalDateStr(new Date(card.purchase.date))}</span><span aria-label="方案金額">NT$ {card.purchase.amount.toLocaleString()}</span></>}
      {card.expiresAt?<span>{toLocalDateStr(new Date(card.expiresAt))} 到期</span>:card.activationDays?<span>首次上課起 {card.activationDays} 天</span>:null}
      {(card.closed||card.expired)&&<span>{card.closed?'已結束':'已到期'}</span>}
    </p>}
    {card.grid && <LessonProgressGrid voided={(card.grid.voidedDates??[]).map((date,index)=>({id:`void:${card.id}:${index}`,date}))} total={card.grid.total} completed={card.grid.dates.map((date,index)=>({id:`${card.id}:${index}`,date}))} columns={Math.min(card.grid.total,card.grid.total % 5 === 0 ? 5 : 4)} showSummary={false} gridClassName="cp-phone-grid" />}
    {card.held>0&&<p className="cp-muted cp-phone-plan-held">已預約 {card.held} {unit} · 可再約 {card.available} {unit}</p>}
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
      {!result && <p role="status">讀取課程資料…</p>}
      {result&&refreshing&&<p role="status" className="cp-muted">更新中…</p>}
      {result && !result.success && <div role="alert" className="cp-error"><p>{result.error}</p><button type="button" disabled={refreshing} onClick={()=>{setState(null);setRetry(value=>value+1);}}>重試</button></div>}
      {result?.success && result.learners.map(learner => <details key={learner.id} name={`phone-learners-${scope}`} className="cp-phone-learner">
        <summary><span><strong>{learner.name}</strong>{learner.upcoming[0]&&<span className="cp-phone-next">下次上課 {formatTWDateTime(new Date(learner.upcoming[0].startsAt))}</span>}</span><span className="cp-phone-expand" aria-hidden="true">⌄</span></summary>
        <div className="cp-phone-learner-body">
          {learner.cards.filter(card => !card.closed && !card.expired).map(card => <Plan key={card.id} card={card} />)}
          {!learner.cards.some(card => !card.closed && !card.expired) && <p className="cp-muted">尚無有效方案</p>}
          {learner.cards.some(card => card.closed || card.expired) && <details className="cp-phone-history"><summary>歷史方案</summary>{learner.cards.filter(card => card.closed || card.expired).map(card => <Plan key={card.id} card={card} />)}</details>}

        </div>
      </details>)}
    </section>
    {result && !result.success && children}
  </>;
}
