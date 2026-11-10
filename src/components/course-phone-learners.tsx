"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { loadCoursePhoneSummary } from "@/server/actions/course-phone-summary";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

type Summary = Awaited<ReturnType<typeof loadCoursePhoneSummary>>;
type Learner = Extract<Summary, { success: true }>["learners"][number];

function Plan({ card }: { card: Learner["cards"][number] }) {
  const unit = card.unit === "SESSION" ? "堂" : "點";
  return <section className="cp-phone-plan" aria-label={card.name}>
    <h4>{card.name}{card.shared && <span className="cp-muted"> · 共用</span>}</h4>
    {card.grid && <ol className={`cp-phone-grid${card.grid.total % 5 === 0 ? " cp-phone-grid-five" : ""}`} aria-label={`${card.name}，共 ${card.grid.total} 堂`} style={card.grid.total < 4 ? { gridTemplateColumns: `repeat(${card.grid.total}, minmax(0, 1fr))` } : undefined}>
      {Array.from({ length: card.grid.total }, (_, index) => {
        const date = card.grid!.dates[index];
        return <li key={index} aria-label={`第 ${index + 1} 堂${date ? `，已上課 ${toLocalDateStr(new Date(date))}` : "，尚無上課紀錄"}`} className={date ? "is-attended" : undefined}>
          {date && <time dateTime={date}>{toLocalDateStr(new Date(date)).slice(5).replace("-", "/")}</time>}
        </li>;
      })}
    </ol>}
    <p className="cp-muted">剩餘 {card.remaining} {unit} · 已預約 {card.held} {unit} · 可再約 {card.available} {unit}{card.closed ? " · 已結束" : card.expired ? " · 已到期" : ""}</p>
  </section>;
}

export function CoursePhoneLearners({ scope, disabled = false, children }: { scope: string; disabled?: boolean; children?: ReactNode }) {
  const reader = usePanelReader("course-phone-summary", loadCoursePhoneSummary, scope, 0);
  const [state, setState] = useState<{ scope: string; result: Summary } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (disabled) return;
    let active = true;
    reader.read().then(result => { if (active) setState({ scope, result }); })
      .catch(() => { if (active) setState({ scope, result: { success: false, error: "目前無法讀取學員課程，請重試" } }); });
    return () => { active = false; };
  }, [reader, scope, retry, disabled]);
  const result = state?.scope === scope ? state.result : null;
  if (disabled || (result?.success && !result.learners.length)) return children ?? null;
  return <>
    <section className="cp-card cp-phone-group" aria-label="同電話學員課程">
      <header className="cp-phone-heading"><h2>我的學員</h2><button type="button" className="cp-text-action" onClick={() => { reader.invalidate(); setState(null); setRetry(value => value + 1); }}>重新讀取</button></header>
      {!result && <p role="status">讀取學員課程…</p>}
      {result && !result.success && <p role="alert" className="cp-error">{result.error}</p>}
      {result?.success && result.learners.map(learner => <details key={learner.id} name={`phone-learners-${scope}`} className="cp-phone-learner">
        <summary><span><strong>{learner.name}</strong><span className="cp-phone-next">{learner.upcoming[0] ? `下次上課 ${formatTWDateTime(new Date(learner.upcoming[0].startsAt))}` : "尚無上課安排"}</span></span><span className="cp-phone-expand" aria-hidden="true">⌄</span></summary>
        <div className="cp-phone-learner-body">
          {learner.cards.filter(card => !card.closed && !card.expired).map(card => <Plan key={card.id} card={card} />)}
          {!learner.cards.some(card => !card.closed && !card.expired) && <p className="cp-muted">尚無有效方案</p>}
          {learner.cards.some(card => card.closed || card.expired) && <details className="cp-phone-history"><summary>歷史方案</summary>{learner.cards.filter(card => card.closed || card.expired).map(card => <Plan key={card.id} card={card} />)}</details>}
          <details className="cp-phone-history"><summary>課程紀錄</summary>
            {[...learner.upcoming, ...learner.history].map(lesson => <p key={lesson.id}>{formatTWDateTime(new Date(lesson.startsAt))} · {lesson.name} · {lesson.status}</p>)}
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
