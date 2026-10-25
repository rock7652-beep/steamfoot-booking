"use client";
import { useEffect, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { browseCourseCards } from "@/server/actions/course-browse";
import type { CourseCardView } from "./member-workspace";

export function useCardDetail(open: boolean, cardId: string, opening: number,loadOrScope?:typeof browseCourseCards|"operational"|"legacy") {
  const load=typeof loadOrScope==="function"?loadOrScope:undefined;
  const dataScope=typeof loadOrScope==="string"?loadOrScope:undefined;
  const reader = usePanelReader(load?"module-card":"course-card", load??browseCourseCards);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: CourseCardView; error?: string }>();
  const key = JSON.stringify([cardId, opening, revision, dataScope]);
  useEffect(() => {
    if (!open || !cardId) return;
    let active = true;
    reader.read({ cardId, dataScope }).then(value => {
      if (!active) return;
      setResult(value.success && value.rows[0]
        ? { key, data: value.rows[0] }
        : { key, error: value.success ? "找不到方案，請重試" : value.error });
    }).catch(() => {
      if (active) setResult({ key, error: "讀取方案失敗，請重試" });
    });
    return () => { active = false; };
  }, [open, cardId, key, reader, dataScope]);
  const current = open && result?.key === key ? result : undefined;
  const loading = open && !!cardId && !current;
  function retry() {
    if (!open || loading) return;
    reader.invalidate({ cardId, dataScope });
    setRevision(value => value + 1);
  }
  return { data: current?.data, error: current?.error, loading, retry };
}
