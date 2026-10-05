"use client";
import { useEffect, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { browseCourseCards } from "@/server/actions/course-browse";
import type { CourseCardView } from "./member-workspace";

export function useCardDetail(open: boolean, cardId: string, opening: number) {
  const reader = usePanelReader("course-card", browseCourseCards);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: CourseCardView; error?: string }>();
  const key = JSON.stringify([cardId, opening, revision]);
  useEffect(() => {
    if (!open || !cardId) return;
    let active = true;
    reader.read({ cardId }).then(value => {
      if (!active) return;
      setResult(value.success && value.rows[0]
        ? { key, data: value.rows[0] }
        : { key, error: value.success ? "找不到方案，請重試" : value.error });
    }).catch(() => {
      if (active) setResult({ key, error: "讀取方案失敗，請重試" });
    });
    return () => { active = false; };
  }, [open, cardId, key, reader]);
  const current = open && result?.key === key ? result : undefined;
  const loading = open && !!cardId && !current;
  function retry() {
    if (!open || loading) return;
    reader.invalidate({ cardId });
    setRevision(value => value + 1);
  }
  return { data: current?.data, error: current?.error, loading, retry };
}
