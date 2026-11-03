"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { coursePersonnelText, type CoursePersonnelLabel } from "@/lib/course-personnel-label";
const Context = createContext<{ storeId: string; label: CoursePersonnelLabel | null }>({ storeId: "", label: null });
export function CoursePersonnelLabelProvider({storeId, label, children}: {storeId: string; label: CoursePersonnelLabel | null; children?: ReactNode}) {
  const [confirmed, setConfirmed] = useState({storeId, source: label, label});
  const current = confirmed.storeId===storeId && confirmed.source===label ? confirmed.label : label;
  const value = useMemo(()=>({storeId,label:current}),[storeId,current]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{storeId: string; label: CoursePersonnelLabel | null}>).detail;
      if (detail?.storeId === storeId && (detail.label === null || detail.label === "老師" || detail.label === "教練")) setConfirmed({storeId,source:label,label:detail.label});
    };
    window.addEventListener("course-personnel-label-saved", receive);
    return () => window.removeEventListener("course-personnel-label-saved", receive);
  }, [storeId,label]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCoursePersonnelLabel() {return useContext(Context);}
export function useCoursePersonnelText() {
  const {label} = useContext(Context);
  return useCallback((text: string) => coursePersonnelText(text, label), [label]);
}
export function CoursePersonnelText({text}: {text: string}) {const t = useCoursePersonnelText(); return t(text);}
