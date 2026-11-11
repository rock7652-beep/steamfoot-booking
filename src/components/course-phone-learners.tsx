"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { loadCoursePhoneSummary } from "@/server/actions/course-phone-summary";
import {CoursePlanDateGrid} from "@/components/course-plan-date-grid";
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
    {card.grid && <CoursePlanDateGrid grid={card.grid} cardId={card.id}/>}
    {card.shared&&card.unit==="SESSION"&&!card.grid&&<p className="cp-muted">共用方案使用日期請洽門市核對</p>}
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
  const sharedIds=new Set(result?.success?result.sharedPlans?.map(plan=>plan.card.id):[]);
  if (disabled || (result?.success && !result.learners.length)) return children ?? null;
  return <>
    <section className="cp-card cp-phone-group" aria-label="同電話學員課程" aria-busy={refreshing}>
      {!result && <p role="status">讀取課程資料…</p>}
      {result&&refreshing&&<p role="status" className="cp-muted">更新中…</p>}
      {result && !result.success && <div role="alert" className="cp-error"><p>{result.error}</p><button type="button" disabled={refreshing} onClick={()=>{setState(null);setRetry(value=>value+1);}}>重試</button></div>}
      {result?.success && result.learners.filter(learner=>!learner.cards.length||learner.cards.some(card=>!sharedIds.has(card.id))).map(learner => <details key={learner.id} name={`phone-learners-${scope}`} className="cp-phone-learner">
        <summary><span><strong>{learner.name}</strong>{learner.upcoming[0]&&<span className="cp-phone-next">下次上課 {formatTWDateTime(new Date(learner.upcoming[0].startsAt))}</span>}</span><span className="cp-phone-expand" aria-hidden="true">⌄</span></summary>
        <div className="cp-phone-learner-body">
          {learner.cards.filter(card => !sharedIds.has(card.id)&&!card.closed && !card.expired).map(card => <Plan key={card.id} card={card} />)}
          {!learner.cards.some(card => !sharedIds.has(card.id)&&!card.closed && !card.expired) && <p className="cp-muted">尚無有效方案</p>}
          {learner.cards.some(card => !sharedIds.has(card.id)&&(card.closed || card.expired)) && <details className="cp-phone-history"><summary>歷史方案</summary>{learner.cards.filter(card => !sharedIds.has(card.id)&&(card.closed || card.expired)).map(card => <Plan key={card.id} card={card} />)}</details>}

        </div>
      </details>)}
      {result?.success&&result.sharedPlans?.map(plan=><details key={`shared:${plan.card.id}`} name={`phone-learners-${scope}`} className="cp-phone-learner" aria-label={`${plan.card.name} 共用方案`}>
        <summary><strong>{plan.learnerNames.join('、')}</strong><span className="cp-phone-expand" aria-hidden="true">⌄</span></summary>
        <div className="cp-phone-learner-body"><Plan card={plan.card}/></div>
      </details>)}
    </section>
    {result && !result.success && children}
  </>;
}
