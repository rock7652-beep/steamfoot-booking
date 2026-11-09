import type { CourseAgreementClause } from './course-agreement';
/** Exact plain-text ranges only; never parse merchant text as HTML or Markdown. */
export function courseAgreementTextRuns(clause: CourseAgreementClause) {
  const ranges: { start: number; end: number }[] = [];
  for (const text of clause.emphasis ?? []) {
    if (!text) continue;
    let start = clause.body.indexOf(text);
    while (start !== -1) {
      ranges.push({ start, end: start + text.length });
      start = clause.body.indexOf(text, start + text.length);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const runs: { text: string; emphasized: boolean }[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) runs.push({ text: clause.body.slice(cursor, range.start), emphasized: false });
    runs.push({ text: clause.body.slice(range.start, range.end), emphasized: true }); cursor = range.end;
  }
  if (cursor < clause.body.length) runs.push({ text: clause.body.slice(cursor), emphasized: false });
  return runs;
}
