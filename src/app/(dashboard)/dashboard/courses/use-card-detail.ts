"use client";
import { useEffect, useRef, useState } from "react";
import {useCourseCardDetailReader} from "@/components/admin/use-course-card-detail-reader";
import type { browseCourseCards } from "@/server/actions/course-browse";
import type { CourseCardView } from "./member-workspace";

export function useCardDetail(open: boolean, cardId: string, opening: number,loadOrScope?:typeof browseCourseCards|"operational"|"legacy",fresh=false,initialData?:CourseCardView,scope?:{storeId?:string;revision?:number;preloadSource?:boolean}) {
  const load=typeof loadOrScope==="function"?loadOrScope:undefined;
  const dataScope=typeof loadOrScope==="string"?loadOrScope:undefined;
  const reader = useCourseCardDetailReader(load,scope?.storeId,scope?.revision,scope?.preloadSource);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([cardId, opening, revision, dataScope,scope?.storeId,scope?.revision]);
  // A roster bundle is a fresh, permission-checked read for this exact opening.
  const initial=useRef({key,reader,data:initialData?.id===cardId?initialData:undefined});
  const [result, setResult] = useState<{ key: string; data?: CourseCardView; error?: string }|undefined>(()=>initialData?.id===cardId?{key,data:initialData}:undefined);
  useEffect(() => {
    if (!open || !cardId) return;
    if(!fresh&&initial.current.data&&initial.current.key===key&&initial.current.reader===reader)return;
    let active = true;
    if(fresh)reader.invalidate({cardId,dataScope});
    reader.read({ cardId, dataScope }).then(value => {
      if (!active) return;
      setResult(value.success && value.rows[0]
        ? { key, data: value.rows[0] }
        : { key, error: value.success ? "找不到方案，請重試" : value.error });
    }).catch(() => {
      if (active) setResult({ key, error: "讀取方案失敗，請重試" });
    });
    return () => { active = false; };
  }, [open, cardId, key, reader, dataScope,fresh]);
  const cached=!fresh&&open?(reader.get({cardId,dataScope})??reader.peek({cardId,dataScope})):undefined;
  const current = open && result?.key === key ? result : cached?.success&&cached.rows[0]?{key,data:cached.rows[0]}:undefined;
  const loading = open && !!cardId && !current;
  function retry() {
    if (!open || loading) return;
    reader.invalidate({ cardId, dataScope });
    setRevision(value => value + 1);
  }
  return { data: current?.data, error: current?.error, loading, retry };
}
