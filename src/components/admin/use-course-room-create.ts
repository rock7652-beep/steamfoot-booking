"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { courseRoomInput, COURSE_ROOM_SAVED, type CourseRoomCreateInput, type CreatedCourseRoom } from "@/lib/course-room-input";

const savedResponse = z.object({ success: z.literal(true), storeId: z.string(),
  data: courseRoomInput.extend({ id: z.string().min(1), isActive: z.boolean() }), syncWarning: z.boolean().optional() });

export function useCourseRoomCreate(storeId: string | undefined, onSaved: (room: CreatedCourseRoom, warning: boolean) => void) {
  const lock = useRef(false), active = useRef(false);
  const attempt = useRef<CourseRoomCreateInput | null>(null);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState("");
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function reset() { if (!lock.current) { attempt.current = null; setUncertain(false); setError(""); } }
  async function save(data: FormData) {
    if (lock.current) return;
    if (!storeId) { setError("店舖資訊已過期，請重新整理後再新增。"); return; }
    lock.current = true; setPending(true); setError("");
    const started = performance.now();
    attempt.current ??= {
      expectedStoreId: storeId, requestKey: crypto.randomUUID(),
      name: String(data.get("name") ?? ""), category: String(data.get("category") ?? ""),
      capacity: data.get("roomCapacity") ? Number(data.get("roomCapacity")) : null,
      details: String(data.get("details") ?? ""), equipment: String(data.get("equipment") ?? ""), location: String(data.get("location") ?? ""),
      rentalEnabled: data.get("rentalEnabled") === "yes", rentalHourlyRate: Number(data.get("rentalHourlyRate") || 0), rentalBufferMinutes: Number(data.get("rentalBufferMinutes") || 0),
    };
    try {
      const response = await fetch("/api/courses/rooms", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store", body: JSON.stringify(attempt.current), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!active.current) return;
      if (result.success === false && result.uncertain !== true && typeof result.error === "string") {
        // Explicit rejection: allow editing. Ambiguous transport failures keep
        // the same payload/key so retry first confirms the original commit.
        attempt.current = null; setUncertain(false); setError(result.error); return;
      }
      const saved = savedResponse.parse(result);
      if (saved.storeId !== storeId) throw new Error("stale store response");
      attempt.current = null; setUncertain(false);
      onSaved(saved.data, !!saved.syncWarning);
      console.info("[COURSE_ROOM_CLIENT_PERF]", { responseMs: Math.round(performance.now() - started) });
      window.dispatchEvent(new CustomEvent(COURSE_ROOM_SAVED, { detail: { storeId } }));
    } catch {
      if (active.current) { setUncertain(true); setError("尚未確認儲存結果。請重試確認，系統會核對同一次送出，避免重複新增。"); }
    } finally {
      lock.current = false;
      if (active.current) setPending(false);
    }
  }
  return { save, reset, pending, uncertain, error };
}
