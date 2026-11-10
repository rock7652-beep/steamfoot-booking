"use client";
import { useEffect, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { loadCoursePhoneSummary } from "@/server/actions/course-phone-summary";
import { formatTWDateTime } from "@/lib/date-utils";

export function CoursePhoneLearners({ scope }: { scope: string }) {
  const reader = usePanelReader("course-phone-summary", loadCoursePhoneSummary, scope, 0);
  const [state, setState] = useState<{ scope: string; result: Awaited<ReturnType<typeof loadCoursePhoneSummary>> } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    reader.read().then(result => { if (active) setState({ scope, result }); })
      .catch(() => { if (active) setState({ scope, result: { success: false, error: "目前無法讀取學員課程，請重試" } }); });
    return () => { active = false; };
  }, [reader, scope, retry]);
  const result = state?.scope === scope ? state.result : null;
  if (result?.success && !result.learners.length) return null;
  return <section className="cp-card cp-phone-group" aria-label="同電話學員課程">
    <h2>同電話學員</h2>
    {!result && <p role="status">讀取學員課程…</p>}
    {result && !result.success && <p role="alert" className="cp-error">{result.error}</p>}
    {result?.success && result.learners.map(learner => <article key={learner.id} className="cp-phone-learner">
      <h3>{learner.name}</h3>
      <p>{learner.upcoming[0] ? `下次上課：${formatTWDateTime(new Date(learner.upcoming[0].startsAt))} · ${learner.upcoming[0].name}` : "尚無上課安排"}</p>
      {learner.cards.map(card => <p key={card.id}>{card.name}{card.shared ? "（共用方案）" : ""} · 剩餘 {card.remaining} {card.unit === "SESSION" ? "堂" : "點"} · 可用 {card.available} {card.unit === "SESSION" ? "堂" : "點"}{card.closed ? " · 已結束" : card.expired ? " · 已到期" : ""}</p>)}
      {!learner.cards.length && <p className="cp-muted">尚無方案</p>}
      <details><summary>課程紀錄</summary>
        {[...learner.upcoming, ...learner.history].map(lesson => <p key={lesson.id}>{formatTWDateTime(new Date(lesson.startsAt))} · {lesson.name} · {lesson.status}</p>)}
        {!learner.upcoming.length && !learner.history.length && <p>尚無課程紀錄</p>}
        {learner.upcoming.length === 20 && <p className="cp-muted">顯示接下來 20 筆課程</p>}
        {!!learner.history.length && <p className="cp-muted">顯示最近 {learner.history.length} 筆過往課程</p>}
      </details>
    </article>)}
    <button type="button" className="cp-text-action" onClick={() => { reader.invalidate(); setState(null); setRetry(value => value + 1); }}>重新讀取</button>
  </section>;
}
