"use client";
import { useState } from 'react';
import { LessonProgressGrid } from './lesson-progress-grid';
import type { PlanUsageProgress, PlanUsageDate } from '@/lib/plan-usage-progress';
import { toLocalDateStr } from '@/lib/date-utils';
export function PlanUsageGrid({ progress, unitLabel = '次' }: { progress: PlanUsageProgress; unitLabel?: string }) {
  const [selected, setSelected] = useState<PlanUsageDate | null>(null);
  if (!progress.available) return <p role="status" className="py-2 text-sm text-earth-600">{progress.reason}</p>;
  const active = [...progress.completed, ...progress.voided].find(row => row.id === selected?.id);
  return <div className="my-2 min-w-0 space-y-1"><LessonProgressGrid compact showSummary={false} total={progress.total} completed={progress.completed} voided={progress.voided} unitLabel={unitLabel} title="使用紀錄" completedLabel="已使用" onSelect={setSelected} />{active && <p role="status" className="text-sm text-earth-600">{toLocalDateStr(new Date(active.date))}{active.customerName ? ` · ${active.customerName}` : ''}{active.courseName ? ` · ${active.courseName}` : ''}</p>}</div>;
}
