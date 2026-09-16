"use client";

import { useCallback, useEffect, useState } from "react";
import { loadCourseHealth, loadCourseMemberHealth, saveCourseHealth, saveCourseMemberHealth } from "@/server/actions/course-health";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import { HealthRecordForm } from "@/app/(customer)/health/new/health-record-form";
import { healthRecordFormData } from "@/lib/health-record-input";
import { toLocalDateStr } from "@/lib/date-utils";
import type { SaveCustomerHealthRecordState } from "@/server/actions/customer-health-record";

type Data = Extract<Awaited<ReturnType<typeof loadCourseHealth>>, { success: true }>['data'];
type Props = { member: true; customerId?: never; canEdit?: never } | { member?: false; customerId: string; canEdit: boolean };

/** Mature measurement form + assessment/history/trend, with explicit scoped adapters. */
export function CourseHealthWorkspace(props: Props) {
  const { member, customerId } = props;
  const canEdit = member || props.canEdit;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<Data['records'][number] | null | undefined>();
  const [requestId, setRequestId] = useState("");
  const load = useCallback(() => member ? loadCourseMemberHealth() : loadCourseHealth(customerId!), [member, customerId]);
  const refresh = useCallback(async () => {
    setError("");
    try {
      const result = await load();
      if (result.success) setData(result.data);
      else { setData(null); setError(result.error); }
    } catch { setError("健康紀錄讀取失敗，請重試"); }
  }, [load]);
  useEffect(() => {
    let active = true;
    load().then(result => {
      if (!active) return;
      if (result.success) setData(result.data);
      else setError(result.error);
    }).catch(() => active && setError("健康紀錄讀取失敗，請重試"));
    return () => { active = false; };
  }, [load]);
  const onSaved = useCallback(() => {
    setEdit(undefined);
    setNotice("量測紀錄已儲存");
    void refresh();
  }, [refresh]);
  async function submit(_state: SaveCustomerHealthRecordState, form: FormData) {
    const values = { ...healthRecordFormData(form), id: edit?.id };
    try {
      const result = member ? await saveCourseMemberHealth(values) : await saveCourseHealth({ ...values, customerId });
      return result.success ? { error: null, saved: true } : { error: result.error };
    } catch { return { error: "連線中斷，已填資料仍保留，請重試" }; }
  }
  return <section className="min-w-0 space-y-4">
    {notice && <p role="status" className="text-sm text-primary-700">{notice}</p>}
    {error ? <div role="alert"><p>{error}</p><button type="button" className="min-h-11 px-3" onClick={refresh}>重新讀取</button></div> : edit !== undefined ? <>
      <button type="button" className="min-h-11 px-3 text-primary-700" onClick={() => setEdit(undefined)}>返回量測紀錄</button>
      <HealthRecordForm requestId={requestId} today={toLocalDateStr()} mode={edit ? "edit" : "create"} initialValues={edit ?? undefined} submitAction={submit} onSaved={onSaved} notePlaceholder="例如：上課前量測" />
    </> : !data ? <p role="status">讀取健康紀錄…</p> : <>
      {canEdit && <button type="button" className="min-h-11 rounded-lg bg-primary-700 px-4 text-white" onClick={() => { setEdit(null); setRequestId(crypto.randomUUID()); setNotice(""); }}>新增量測</button>}
      {data.summary.latest ? <HealthAssessmentCard summary={data.summary} /> : <p>尚無量測紀錄，可新增第一筆量測。</p>}
      {canEdit && <details><summary className="min-h-11 cursor-pointer py-3 font-medium">編輯量測紀錄（最近 100 筆）</summary>
        <ul className="divide-y divide-earth-100">{data.records.map(record => <li key={record.id} className="flex min-w-0 items-center justify-between gap-2 py-2 text-sm">
          <span className="min-w-0 break-words">{record.measuredAt} · {record.weight == null ? "體重未填" : `${record.weight} kg`}</span>
          <button type="button" className="min-h-11 shrink-0 px-3 text-primary-700" onClick={() => { setEdit(record); setRequestId(crypto.randomUUID()); setNotice(""); }}>編輯</button>
        </li>)}</ul>
      </details>}
    </>}
  </section>;
}
